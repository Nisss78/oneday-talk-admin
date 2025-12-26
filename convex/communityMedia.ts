import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// コミュニティのメディア一覧を取得（メンバー用）
export const listMedia = query({
  args: {
    communityId: v.id("communities"),
    mediaType: v.optional(v.union(v.literal("ad"), v.literal("info"), v.literal("announcement"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    // ユーザーがコミュニティメンバーか確認
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { media: [], unreadCount: 0 };
    }

    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    // メンバーでない場合は空の配列を返す（エラーにしない）
    if (!membership) {
      return { media: [], unreadCount: 0 };
    }

    const now = Date.now();
    let media;

    if (args.mediaType) {
      media = await ctx.db
        .query("communityMedia")
        .withIndex("by_community_type", (q) =>
          q.eq("communityId", args.communityId).eq("mediaType", args.mediaType!)
        )
        .collect();
      // 公開済みのみ
      media = media.filter((m) => m.isPublished);
    } else {
      media = await ctx.db
        .query("communityMedia")
        .withIndex("by_community_published", (q) =>
          q.eq("communityId", args.communityId).eq("isPublished", true)
        )
        .collect();
    }

    // 有効期限切れを除外
    media = media.filter((m) => !m.expiresAt || m.expiresAt > now);

    // ユーザーの既読メディアIDを取得
    const viewedMediaRecords = await ctx.db
      .query("mediaViews")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .collect();
    const viewedMediaIds = new Set(viewedMediaRecords.map((v) => v.mediaId));

    // 各メディアに既読フラグを追加
    const mediaWithReadStatus = media.map((m) => ({
      ...m,
      isRead: viewedMediaIds.has(m._id),
    }));

    // 未読数をカウント
    const unreadCount = mediaWithReadStatus.filter((m) => !m.isRead).length;

    // 優先度順にソート（高いほど先）、同じなら作成日順（新しいほど先）
    mediaWithReadStatus.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    return { media: mediaWithReadStatus, unreadCount };
  },
});

// メディアを既読にする
export const markAsRead = mutation({
  args: {
    mediaId: v.id("communityMedia"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    // 既に既読か確認
    const existingView = await ctx.db
      .query("mediaViews")
      .withIndex("by_user_media", (q) =>
        q.eq("userId", user._id).eq("mediaId", args.mediaId)
      )
      .first();

    if (existingView) {
      return { success: true, alreadyRead: true };
    }

    // 既読レコードを作成
    await ctx.db.insert("mediaViews", {
      userId: user._id,
      mediaId: args.mediaId,
      communityId: media.communityId,
      viewedAt: Date.now(),
    });

    return { success: true, alreadyRead: false };
  },
});

// 全メディアを既読にする
export const markAllAsRead = mutation({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    // 公開中のメディアを取得
    const media = await ctx.db
      .query("communityMedia")
      .withIndex("by_community_published", (q) =>
        q.eq("communityId", args.communityId).eq("isPublished", true)
      )
      .collect();

    // 既読済みのメディアIDを取得
    const viewedMediaRecords = await ctx.db
      .query("mediaViews")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .collect();
    const viewedMediaIds = new Set(viewedMediaRecords.map((v) => v.mediaId));

    // 未読メディアを既読にする
    const now = Date.now();
    let markedCount = 0;
    for (const m of media) {
      if (!viewedMediaIds.has(m._id)) {
        await ctx.db.insert("mediaViews", {
          userId: user._id,
          mediaId: m._id,
          communityId: args.communityId,
          viewedAt: now,
        });
        markedCount++;
      }
    }

    return { success: true, markedCount };
  },
});

// メディア詳細を取得
export const getMedia = query({
  args: {
    mediaId: v.id("communityMedia"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    // ユーザーがコミュニティメンバーか確認
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", media.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("コミュニティのメンバーではありません");
    }

    return media;
  },
});

// ========== 管理者用（運営用） ==========

// メディアを作成（運営用）
export const createMedia = mutation({
  args: {
    communityId: v.id("communities"),
    title: v.string(),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    mediaType: v.union(v.literal("ad"), v.literal("info"), v.literal("announcement")),
    priority: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    const now = Date.now();

    // undefinedのフィールドを除外してinsert
    const mediaData: Record<string, unknown> = {
      communityId: args.communityId,
      title: args.title,
      mediaType: args.mediaType,
      priority: args.priority ?? 0,
      isPublished: args.isPublished ?? false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };

    if (args.content) mediaData.content = args.content;
    if (args.imageUrl) mediaData.imageUrl = args.imageUrl;
    if (args.externalUrl) mediaData.externalUrl = args.externalUrl;
    if (args.isPublished) mediaData.publishedAt = now;
    if (args.expiresAt) mediaData.expiresAt = args.expiresAt;

    const mediaId = await ctx.db.insert("communityMedia", mediaData as any);

    return { mediaId };
  },
});

// メディアを更新（運営用）
export const updateMedia = mutation({
  args: {
    mediaId: v.id("communityMedia"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    mediaType: v.optional(v.union(v.literal("ad"), v.literal("info"), v.literal("announcement"))),
    priority: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(media.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    // undefinedのフィールドを除外してpatch
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;
    if (args.externalUrl !== undefined) updates.externalUrl = args.externalUrl;
    if (args.mediaType !== undefined) updates.mediaType = args.mediaType;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;
    if (args.expiresAt !== undefined) updates.expiresAt = args.expiresAt;

    // 公開状態が変更された場合、publishedAtを更新
    if (args.isPublished === true && !media.publishedAt) {
      updates.publishedAt = Date.now();
    }

    await ctx.db.patch(args.mediaId, updates);

    return { success: true };
  },
});

// メディアを削除（運営用）
export const deleteMedia = mutation({
  args: {
    mediaId: v.id("communityMedia"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(media.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    await ctx.db.delete(args.mediaId);

    return { success: true };
  },
});

// 管理者用：全メディア取得（非公開含む）
export const listAllMedia = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    const media = await ctx.db
      .query("communityMedia")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();

    // 優先度順、作成日順にソート
    media.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    return { media };
  },
});
