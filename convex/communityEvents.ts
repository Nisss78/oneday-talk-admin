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

    // undefinedのフィールドを除外してinsert
    const eventData: Record<string, unknown> = {
      communityId: args.communityId,
      title: args.title,
      eventDate: args.eventDate,
      isPublished: args.isPublished ?? false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };

    if (args.description) eventData.description = args.description;
    if (args.imageUrl) eventData.imageUrl = args.imageUrl;
    if (args.eventEndDate) eventData.eventEndDate = args.eventEndDate;
    if (args.location) eventData.location = args.location;
    if (args.externalUrl) eventData.externalUrl = args.externalUrl;

    const eventId = await ctx.db.insert("communityEvents", eventData as any);

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

    // undefinedのフィールドを除外してpatch
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;
    if (args.eventDate !== undefined) updates.eventDate = args.eventDate;
    if (args.eventEndDate !== undefined) updates.eventEndDate = args.eventEndDate;
    if (args.location !== undefined) updates.location = args.location;
    if (args.externalUrl !== undefined) updates.externalUrl = args.externalUrl;
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;

    await ctx.db.patch(args.eventId, updates);

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

// ========== 公開API（認証不要） ==========

// 公開イベント一覧を取得（ランディングページ用・認証不要）
export const listPublicEvents = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    // 認証不要 - 公開イベントのみ取得
    const now = Date.now();
    const events = await ctx.db
      .query("communityEvents")
      .withIndex("by_community_published", (q) =>
        q.eq("communityId", args.communityId).eq("isPublished", true)
      )
      .collect();

    // 今後のイベントのみをフィルタリングして日付順にソート
    const upcomingEvents = events
      .filter((e) => e.eventDate >= now || (e.eventEndDate && e.eventEndDate >= now))
      .sort((a, b) => a.eventDate - b.eventDate);

    return upcomingEvents;
  },
});
