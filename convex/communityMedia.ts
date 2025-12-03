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
      throw new Error("ユーザーが見つかりません");
    }

    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("コミュニティのメンバーではありません");
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

    // 優先度順にソート（高いほど先）、同じなら作成日順（新しいほど先）
    media.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    return { media };
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
      .first();

    if (!membership || membership.status !== "active") {
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
    const mediaId = await ctx.db.insert("communityMedia", {
      communityId: args.communityId,
      title: args.title,
      content: args.content,
      imageUrl: args.imageUrl,
      externalUrl: args.externalUrl,
      mediaType: args.mediaType,
      priority: args.priority ?? 0,
      isPublished: args.isPublished ?? false,
      publishedAt: args.isPublished ? now : undefined,
      expiresAt: args.expiresAt,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

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

    const { mediaId, ...updateFields } = args;

    // 公開状態が変更された場合、publishedAtを更新
    const updates: any = {
      ...updateFields,
      updatedAt: Date.now(),
    };

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
