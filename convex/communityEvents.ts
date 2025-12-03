import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// コミュニティのイベント一覧を取得（メンバー用）
export const listEvents = query({
  args: {
    communityId: v.id("communities"),
    includeExpired: v.optional(v.boolean()), // 過去のイベントも含めるか
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
    let events = await ctx.db
      .query("communityEvents")
      .withIndex("by_community_published", (q) =>
        q.eq("communityId", args.communityId).eq("isPublished", true)
      )
      .collect();

    // 過去のイベントを除外（オプション）
    if (!args.includeExpired) {
      events = events.filter((e) => e.eventDate >= now || (e.eventEndDate && e.eventEndDate >= now));
    }

    // 日付順にソート（近い順）
    events.sort((a, b) => a.eventDate - b.eventDate);

    return { events };
  },
});

// イベント詳細を取得
export const getEvent = query({
  args: {
    eventId: v.id("communityEvents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("認証が必要です");
    }

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("イベントが見つかりません");
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
        q.eq("communityId", event.communityId).eq("userId", user._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("コミュニティのメンバーではありません");
    }

    return event;
  },
});

// ========== 管理者用（運営用） ==========

// イベントを作成（運営用）
export const createEvent = mutation({
  args: {
    communityId: v.id("communities"),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.number(),
    eventEndDate: v.optional(v.number()),
    location: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
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
    const eventId = await ctx.db.insert("communityEvents", {
      communityId: args.communityId,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      location: args.location,
      externalUrl: args.externalUrl,
      isPublished: args.isPublished ?? false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return { eventId };
  },
});

// イベントを更新（運営用）
export const updateEvent = mutation({
  args: {
    eventId: v.id("communityEvents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventEndDate: v.optional(v.number()),
    location: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
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

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("イベントが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(event.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    const { eventId, ...updateFields } = args;
    await ctx.db.patch(args.eventId, {
      ...updateFields,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// イベントを削除（運営用）
export const deleteEvent = mutation({
  args: {
    eventId: v.id("communityEvents"),
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

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("イベントが見つかりません");
    }

    // コミュニティの管理者か確認
    const community = await ctx.db.get(event.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    await ctx.db.delete(args.eventId);

    return { success: true };
  },
});

// 管理者用：全イベント取得（非公開含む）
export const listAllEvents = query({
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

    const events = await ctx.db
      .query("communityEvents")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();

    // 日付順にソート
    events.sort((a, b) => a.eventDate - b.eventDate);

    return { events };
  },
});
