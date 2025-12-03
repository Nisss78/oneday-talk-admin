import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getCurrentUser } from "./auth";

/**
 * ハンドルでユーザーを検索
 */
export const searchByHandle = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      return [];
    }

    const searchTerm = args.handle.trim().toLowerCase();
    if (!searchTerm) {
      return [];
    }

    // ハンドルで検索（部分一致）
    const users = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("_id"), currentUser._id))
      .collect();

    const matchedUsers = users.filter((user) =>
      user.handle.toLowerCase().includes(searchTerm)
    );

    // プロフィール情報を取得
    const usersWithProfiles = await Promise.all(
      matchedUsers.map(async (user) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        return {
          userId: user._id,
          handle: user.handle,
          displayName: profile?.displayName || "",
          avatarUrl: profile?.avatarUrl || null,
          bio: profile?.bio || null,
        };
      })
    );

    // 結果を最大20件に制限
    return usersWithProfiles.slice(0, 20);
  },
});

/**
 * ユーザーIDでプロフィールを取得
 */
export const getUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    return {
      userId: user._id,
      handle: user.handle,
      displayName: profile?.displayName || "",
      avatarUrl: profile?.avatarUrl || null,
      bio: profile?.bio || null,
      tags: profile?.tags || [],
      topics: profile?.topics || [],
      photoStories: profile?.photoStories || [],
      instagramUrl: profile?.instagramUrl || null,
    };
  },
});

/**
 * ハンドルからユーザーIDを取得
 */
export const getUserIdByHandle = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();

    if (!user) {
      return null;
    }

    return user._id;
  },
});

/**
 * handleが利用可能かチェック
 */
export const checkHandleAvailable = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("認証が必要です");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();

    // 自分のhandleの場合は利用可能として返す
    if (existingUser && existingUser._id === currentUser._id) {
      return { available: true };
    }

    return { available: !existingUser };
  },
});

/**
 * handle変更が可能かチェック（1週間に2回まで）
 */
export const canChangeHandle = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("認証が必要です");
    }

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const recentChanges = await ctx.db
      .query("handleHistory")
      .withIndex("by_user_id", (q) => q.eq("userId", currentUser._id))
      .filter((q) => q.gte(q.field("changedAt"), oneWeekAgo))
      .collect();

    const canChange = recentChanges.length < 2;
    return {
      canChange,
      changesThisWeek: recentChanges.length,
      remainingChanges: Math.max(0, 2 - recentChanges.length),
    };
  },
});

/**
 * handle変更履歴を取得
 */
export const getHandleHistory = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      return [];
    }

    const history = await ctx.db
      .query("handleHistory")
      .withIndex("by_user_id", (q) => q.eq("userId", currentUser._id))
      .order("desc")
      .take(10);

    return history;
  },
});

/**
 * Clerk統合用のstoreミューテーション
 * ConvexProviderWithClerkが自動的に呼び出す
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthenticated call to store");
    }

    // Clerkのユーザー識別子（subject）をclerkIdとして使用
    const clerkId = identity.subject;

    // 既存のユーザーをチェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existingUser) {
      // 既存ユーザーの場合はpushTokenの更新のみ許可（必要に応じて）
      return existingUser._id;
    }

    // 新しいユーザーを作成
    // handleは一時的な値（user_XXX形式）で初期化
    const tempHandle = `user_${clerkId.substring(clerkId.lastIndexOf('|') + 1, clerkId.lastIndexOf('|') + 9)}`;

    const userId = await ctx.db.insert("users", {
      clerkId,
      handle: tempHandle,
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * handleを更新
 */
export const updateHandle = mutation({
  args: {
    newHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("認証が必要です");
    }

    const newHandle = args.newHandle.trim();

    // handleのバリデーション
    if (newHandle.length < 3 || newHandle.length > 20) {
      throw new Error("ユーザーIDは3〜20文字で入力してください");
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newHandle)) {
      throw new Error("ユーザーIDは英数字とアンダースコアのみ使用できます");
    }

    // 既に同じhandleを使用している場合はスキップ
    if (currentUser.handle === newHandle) {
      return { success: true, message: "変更なし" };
    }

    // 重複チェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", newHandle))
      .first();

    if (existingUser) {
      throw new Error("このユーザーIDは既に使用されています");
    }

    // 変更回数チェック
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentChanges = await ctx.db
      .query("handleHistory")
      .withIndex("by_user_id", (q) => q.eq("userId", currentUser._id))
      .filter((q) => q.gte(q.field("changedAt"), oneWeekAgo))
      .collect();

    if (recentChanges.length >= 2) {
      throw new Error("ユーザーIDの変更は1週間に2回までです");
    }

    // handle変更
    const oldHandle = currentUser.handle;
    console.log('updateHandle: Starting update', {
      userId: currentUser._id,
      oldHandle,
      newHandle,
      timestamp: Date.now()
    });

    await ctx.db.patch(currentUser._id, { handle: newHandle });

    // 変更後のユーザー情報を確認
    const updatedUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("_id"), currentUser._id))
      .first();
    console.log('updateHandle: After patch', {
      expectedHandle: newHandle,
      actualHandle: updatedUser?.handle,
      success: updatedUser?.handle === newHandle
    });

    // 履歴に記録
    const historyId = await ctx.db.insert("handleHistory", {
      userId: currentUser._id,
      oldHandle,
      newHandle,
      changedAt: Date.now(),
    });
    console.log('updateHandle: History recorded', { historyId });

    return { success: true, message: "ユーザーIDを変更しました" };
  },
});
