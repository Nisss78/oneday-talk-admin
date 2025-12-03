import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getCurrentUser } from "./auth";
import { Id, Doc } from "./_generated/dataModel";
import {
  sanitizeString,
  validateDisplayName,
  validateBio,
  validateTags,
  validateTopics,
  validatePhotoStories,
} from "./validation";
import { getCurrentDateJST } from "./utils/dateUtils";

/**
 * プロフィール作成
 */
export const createProfile = mutation({
  args: {
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    photoStories: v.optional(v.array(
      v.object({
        imageUrl: v.string(),
        caption: v.string(),
      })
    )),
    bio: v.optional(v.string()),
    tags: v.array(v.string()),
    topics: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
      })
    ),
    instagramUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("認証が必要です");
    }

    // 入力検証
    const displayNameValidation = validateDisplayName(args.displayName);
    if (!displayNameValidation.valid) {
      throw new Error(displayNameValidation.error);
    }

    const bioValidation = validateBio(args.bio);
    if (!bioValidation.valid) {
      throw new Error(bioValidation.error);
    }

    const tagsValidation = validateTags(args.tags);
    if (!tagsValidation.valid) {
      throw new Error(tagsValidation.error);
    }

    const topicsValidation = validateTopics(args.topics);
    if (!topicsValidation.valid) {
      throw new Error(topicsValidation.error);
    }

    if (args.photoStories) {
      const photoStoriesValidation = validatePhotoStories(args.photoStories);
      if (!photoStoriesValidation.valid) {
        throw new Error(photoStoriesValidation.error);
      }
    }

    // 既存のプロフィールをチェック
    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (existingProfile) {
      throw new Error("プロフィールは既に存在します");
    }

    // サニタイズ
    const sanitizedDisplayName = sanitizeString(args.displayName);
    const sanitizedBio = args.bio ? sanitizeString(args.bio) : null;
    const sanitizedTags = args.tags.map(tag => sanitizeString(tag));
    const sanitizedTopics = args.topics.map(topic => ({
      title: sanitizeString(topic.title),
      description: sanitizeString(topic.description),
    }));

    const profileId = await ctx.db.insert("profiles", {
      userId: user._id,
      displayName: sanitizedDisplayName,
      avatarUrl: args.avatarUrl ?? null,
      photoStories: args.photoStories ?? [],
      bio: sanitizedBio,
      tags: sanitizedTags,
      topics: sanitizedTopics,
      instagramUrl: args.instagramUrl ? sanitizeString(args.instagramUrl) : null,
      updatedAt: Date.now(),
    });

    return profileId;
  },
});

/**
 * プロフィール更新
 */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    photoStories: v.optional(v.array(
      v.object({
        imageUrl: v.string(),
        caption: v.string(),
      })
    )),
    bio: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    topics: v.optional(
      v.array(
        v.object({
          title: v.string(),
          description: v.string(),
        })
      )
    ),
    instagramUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("認証が必要です");
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error("プロフィールが見つかりません");
    }

    // 入力検証
    if (args.displayName !== undefined) {
      const validation = validateDisplayName(args.displayName);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    if (args.bio !== undefined) {
      const validation = validateBio(args.bio);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    if (args.tags !== undefined) {
      const validation = validateTags(args.tags);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    if (args.topics !== undefined) {
      const validation = validateTopics(args.topics);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    if (args.photoStories !== undefined) {
      const validation = validatePhotoStories(args.photoStories);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    // 型安全な更新オブジェクトを構築
    const updates: Partial<Omit<Doc<"profiles">, "_id" | "_creationTime" | "userId">> = {
      updatedAt: Date.now(),
    };

    if (args.displayName !== undefined) {
      updates.displayName = sanitizeString(args.displayName);
    }
    if (args.avatarUrl !== undefined) {
      updates.avatarUrl = args.avatarUrl;
    }
    if (args.photoStories !== undefined) {
      updates.photoStories = args.photoStories.map(story => ({
        imageUrl: story.imageUrl,
        caption: sanitizeString(story.caption),
      }));
    }
    if (args.bio !== undefined) {
      updates.bio = args.bio ? sanitizeString(args.bio) : null;
    }
    if (args.tags !== undefined) {
      updates.tags = args.tags.map(tag => sanitizeString(tag));
    }
    if (args.topics !== undefined) {
      updates.topics = args.topics.map(topic => ({
        title: sanitizeString(topic.title),
        description: sanitizeString(topic.description),
      }));
    }
    if (args.instagramUrl !== undefined) {
      updates.instagramUrl = args.instagramUrl ? sanitizeString(args.instagramUrl) : null;
    }

    await ctx.db.patch(profile._id, updates);

    return profile._id;
  },
});

/**
 * 現在のユーザーのプロフィール取得
 */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    return profile;
  },
});

/**
 * ユーザーIDでプロフィール取得
 * アクセス制御: 自分、友達、または今日マッチした相手のみ閲覧可能
 */
export const getProfileByUserId = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    // 自分自身のプロフィールは常に閲覧可能
    if (currentUser && currentUser._id === args.userId) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
        .first();
      return profile;
    }

    // 未認証ユーザーはアクセス不可
    if (!currentUser) {
      throw new Error("認証が必要です");
    }

    // 友達関係をチェック
    const isFriend = await checkIsFriend(ctx, currentUser._id, args.userId);

    // 今日のマッチング関係をチェック
    const isMatchedToday = await checkIsMatchedToday(ctx, currentUser._id, args.userId);

    // 友達または今日マッチした相手のみ閲覧可能
    if (!isFriend && !isMatchedToday) {
      throw new Error("このプロフィールを閲覧する権限がありません");
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();

    return profile;
  },
});

/**
 * 友達関係をチェックするヘルパー関数
 */
async function checkIsFriend(
  ctx: QueryCtx,
  userId1: Id<"users">,
  userId2: Id<"users">
): Promise<boolean> {
  // userId1 → userId2 の友達関係（複合インデックス使用）
  const friendship1 = await ctx.db
    .query("friendships")
    .withIndex("by_requester_addressee", (q) =>
      q.eq("requesterId", userId1).eq("addresseeId", userId2)
    )
    .filter((q) => q.eq(q.field("status"), "accepted"))
    .first();

  if (friendship1) return true;

  // userId2 → userId1 の友達関係（複合インデックス使用）
  const friendship2 = await ctx.db
    .query("friendships")
    .withIndex("by_requester_addressee", (q) =>
      q.eq("requesterId", userId2).eq("addresseeId", userId1)
    )
    .filter((q) => q.eq(q.field("status"), "accepted"))
    .first();

  return !!friendship2;
}

/**
 * 今日マッチしているかチェックするヘルパー関数
 */
async function checkIsMatchedToday(
  ctx: QueryCtx,
  userId1: Id<"users">,
  userId2: Id<"users">
): Promise<boolean> {
  const today = getCurrentDateJST();

  // 複合インデックスを使用してセッションを検索
  const sessionA = await ctx.db
    .query("dailySessions")
    .withIndex("by_date_user_a", (q) => q.eq("dateJst", today).eq("userIdA", userId1))
    .filter((q) => q.and(
      q.eq(q.field("state"), "active"),
      q.eq(q.field("userIdB"), userId2)
    ))
    .first();

  if (sessionA) return true;

  const sessionB = await ctx.db
    .query("dailySessions")
    .withIndex("by_date_user_a", (q) => q.eq("dateJst", today).eq("userIdA", userId2))
    .filter((q) => q.and(
      q.eq(q.field("state"), "active"),
      q.eq(q.field("userIdB"), userId1)
    ))
    .first();

  return !!sessionB;
}

/**
 * ハンドルでユーザーとプロフィールを取得
 * アクセス制御: 検索時は基本情報のみ、友達・マッチ相手は全情報
 */
export const getProfileByHandle = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .first();

    if (!user) {
      return null;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      return null;
    }

    // 自分自身の場合は全情報を返す
    if (currentUser._id === user._id) {
      return { user, profile };
    }

    // 友達またはマッチした相手かチェック
    const isFriend = await checkIsFriend(ctx, currentUser._id, user._id);
    const isMatchedToday = await checkIsMatchedToday(ctx, currentUser._id, user._id);

    // 友達またはマッチした相手の場合は全情報を返す
    if (isFriend || isMatchedToday) {
      return { user, profile };
    }

    // それ以外の場合は基本情報のみ返す（友達検索用）
    return {
      user,
      profile: {
        ...profile,
        bio: null, // ひとことは非表示
        topics: [], // 話題カードは非表示
      },
    };
  },
});

/**
 * プロフィールが存在するかチェック
 */
export const hasProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return false;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    return profile !== null;
  },
});

/**
 * トピックを削除
 */
export const deleteTopic = mutation({
  args: {
    topicIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("認証が必要です");
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error("プロフィールが見つかりません");
    }

    if (args.topicIndex < 0 || args.topicIndex >= profile.topics.length) {
      throw new Error("無効なトピックインデックスです");
    }

    const newTopics = profile.topics.filter((_, index) => index !== args.topicIndex);

    await ctx.db.patch(profile._id, {
      topics: newTopics,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
