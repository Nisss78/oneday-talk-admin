import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// ClerkユーザーIDからConvexユーザーを取得
export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return user;
  },
});

// ユーザーを作成（ClerkユーザーIDを使用）
export const createUser = mutation({
  args: {
    clerkId: v.string(),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    // 既存のユーザーをチェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      return existingUser._id;
    }

    // handleの重複チェック
    const existingHandle = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();

    if (existingHandle) {
      throw new Error("This handle is already in use");
    }

    // 新しいユーザーを作成
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      handle: args.handle,
      createdAt: Date.now(),
    });

    return userId;
  },
});

// ユーザーを同期（ClerkユーザーIDを使用）
// 注意: 既存ユーザーのhandleは変更しない（updateHandleでのみ変更可能）
export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    // 既存のユーザーをチェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // 既存ユーザーの場合はhandleを変更しない（IDのみ返す）
      return existingUser._id;
    }

    // handleの重複チェック（新規ユーザーの場合のみ）
    const existingHandle = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();

    if (existingHandle) {
      throw new Error("This handle is already in use");
    }

    // 新しいユーザーを作成
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      handle: args.handle,
      createdAt: Date.now(),
    });

    return userId;
  },
});

// オンボーディング用: 初期handleを設定（一時的なhandleからの変更用）
export const setInitialHandle = mutation({
  args: {
    newHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("Authentication required");
    }

    const newHandle = args.newHandle.trim();

    // handleのバリデーション
    if (newHandle.length < 3 || newHandle.length > 20) {
      throw new Error("User ID must be 3-20 characters");
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newHandle)) {
      throw new Error("User ID can only contain alphanumeric characters and underscores");
    }

    // 既に同じhandleの場合はスキップ
    if (currentUser.handle === newHandle) {
      return { success: true, message: "No change" };
    }

    // 一時的なhandle（user_で始まる）からの変更のみ許可
    const isTempHandle = currentUser.handle.startsWith('user_');
    if (!isTempHandle) {
      return { success: true, message: "No change" };
    }

    // 重複チェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", newHandle))
      .first();

    if (existingUser) {
      throw new Error("This user ID is already in use");
    }

    // handle変更
    await ctx.db.patch(currentUser._id, { handle: newHandle });

    return { success: true, message: "User ID has been set" };
  },
});

// 認証されたユーザーを取得（helper関数）
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  return user;
}

// 自分のユーザー情報を取得（query関数 - クライアントから呼び出し可能）
export const getMyUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    return user;
  },
});

/**
 * アカウント削除（全データを削除）
 * Convex側のデータのみ削除。Clerk側は別途クライアントで削除する必要がある。
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("Authentication required");
    }

    const userId = currentUser._id;

    // 1. プロフィールを削除
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();
    if (profile) {
      await ctx.db.delete(profile._id);
    }

    // 2. 友達関係を削除（requesterまたはaddresseeとして）
    const friendshipsAsRequester = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", userId))
      .collect();
    for (const friendship of friendshipsAsRequester) {
      await ctx.db.delete(friendship._id);
    }

    const friendshipsAsAddressee = await ctx.db
      .query("friendships")
      .withIndex("by_addressee", (q) => q.eq("addresseeId", userId))
      .collect();
    for (const friendship of friendshipsAsAddressee) {
      await ctx.db.delete(friendship._id);
    }

    // 3. セッションに関連するメッセージを削除
    // まずユーザーが参加したセッションを取得
    const sessionsAsA = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_a", (q) => q.eq("userIdA", userId))
      .collect();
    const sessionsAsB = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_b", (q) => q.eq("userIdB", userId))
      .collect();

    const allSessions = [...sessionsAsA, ...sessionsAsB];
    const uniqueSessionIds = [...new Set(allSessions.map(s => s._id))];

    // 各セッションのメッセージを削除
    for (const sessionId of uniqueSessionIds) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .collect();
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
    }

    // 4. セッションを削除
    for (const session of allSessions) {
      await ctx.db.delete(session._id);
    }

    // 5. ハンドル変更履歴を削除
    const handleHistories = await ctx.db
      .query("handleHistory")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect();
    for (const history of handleHistories) {
      await ctx.db.delete(history._id);
    }

    // 6. ユーザーを削除
    await ctx.db.delete(userId);

    return { success: true };
  },
});

