import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ========== メンバー用 ==========

/**
 * イベント申請を作成（コミュニティメンバー用）
 */
export const createRequest = mutation({
  args: {
    communityId: v.id("communities"),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.number(),
    eventEndDate: v.optional(v.number()),
    location: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
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

    // コミュニティメンバーか確認
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!membership) {
      throw new Error("コミュニティのメンバーではありません");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("communityEventRequests", {
      communityId: args.communityId,
      requesterId: user._id,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      location: args.location,
      externalUrl: args.externalUrl,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { requestId };
  },
});

/**
 * 自分の申請一覧を取得（メンバー用）
 */
export const listMyRequests = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { requests: [] };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return { requests: [] };
    }

    const requests = await ctx.db
      .query("communityEventRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .filter((q) => q.eq(q.field("communityId"), args.communityId))
      .collect();

    // 新しい順にソート
    requests.sort((a, b) => b.createdAt - a.createdAt);

    return { requests };
  },
});

/**
 * 申請をキャンセル（メンバー用）- pendingのみ
 */
export const cancelRequest = mutation({
  args: {
    requestId: v.id("communityEventRequests"),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    // 自分の申請かつpending状態のみキャンセル可能
    if (request.requesterId !== user._id) {
      throw new Error("他のユーザーの申請はキャンセルできません");
    }

    if (request.status !== "pending") {
      throw new Error("審査待ちの申請のみキャンセルできます");
    }

    await ctx.db.delete(args.requestId);

    return { success: true };
  },
});

// ========== 管理者用（管理画面から呼び出す） ==========

/**
 * コミュニティの申請一覧を取得（管理者用）
 */
export const listPendingRequests = query({
  args: {
    communityId: v.id("communities"),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
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

    // コミュニティ管理者か確認
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    let requests;
    if (args.status) {
      requests = await ctx.db
        .query("communityEventRequests")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", args.communityId).eq("status", args.status!)
        )
        .collect();
    } else {
      requests = await ctx.db
        .query("communityEventRequests")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .collect();
    }

    // 申請者情報を付与
    const requestsWithUser = await Promise.all(
      requests.map(async (request) => {
        const requester = await ctx.db.get(request.requesterId);
        const profile = requester
          ? await ctx.db
              .query("profiles")
              .withIndex("by_user_id", (q) => q.eq("userId", requester._id))
              .first()
          : null;

        return {
          ...request,
          requester: requester
            ? {
                _id: requester._id,
                handle: requester.handle,
                displayName: profile?.displayName ?? requester.handle,
                avatarUrl: profile?.avatarUrl,
              }
            : null,
        };
      })
    );

    // 新しい順にソート
    requestsWithUser.sort((a, b) => b.createdAt - a.createdAt);

    return { requests: requestsWithUser };
  },
});

/**
 * 申請を承認（管理者用）
 * 承認するとcommunityEventsに自動登録
 */
export const approveRequest = mutation({
  args: {
    requestId: v.id("communityEventRequests"),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    // コミュニティ管理者か確認
    const community = await ctx.db.get(request.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    if (request.status !== "pending") {
      throw new Error("審査待ちの申請のみ承認できます");
    }

    const now = Date.now();

    // 申請を承認状態に更新
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: user._id,
      reviewedAt: now,
      updatedAt: now,
    });

    // communityEventsに新規イベントとして登録（公開状態で）
    const eventId = await ctx.db.insert("communityEvents", {
      communityId: request.communityId,
      title: request.title,
      description: request.description,
      imageUrl: request.imageUrl,
      eventDate: request.eventDate,
      eventEndDate: request.eventEndDate,
      location: request.location,
      externalUrl: request.externalUrl,
      isPublished: true, // 承認されたら自動で公開
      createdBy: request.requesterId, // 元の申請者をcreatedByに
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, eventId };
  },
});

/**
 * 申請を却下（管理者用）
 */
export const rejectRequest = mutation({
  args: {
    requestId: v.id("communityEventRequests"),
    rejectionReason: v.optional(v.string()),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    // コミュニティ管理者か確認
    const community = await ctx.db.get(request.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.adminIds.includes(user._id)) {
      throw new Error("管理者権限がありません");
    }

    if (request.status !== "pending") {
      throw new Error("審査待ちの申請のみ却下できます");
    }

    const now = Date.now();

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      rejectionReason: args.rejectionReason,
      reviewedBy: user._id,
      reviewedAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

/**
 * 申請詳細を取得（管理者用）
 */
export const getRequest = query({
  args: {
    requestId: v.id("communityEventRequests"),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    // 自分の申請 または コミュニティ管理者なら閲覧可能
    const community = await ctx.db.get(request.communityId);
    const isAdmin = community?.adminIds.includes(user._id);
    const isOwner = request.requesterId === user._id;

    if (!isAdmin && !isOwner) {
      throw new Error("閲覧権限がありません");
    }

    // 申請者情報を付与
    const requester = await ctx.db.get(request.requesterId);
    const profile = requester
      ? await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", requester._id))
          .first()
      : null;

    return {
      ...request,
      requester: requester
        ? {
            _id: requester._id,
            handle: requester.handle,
            displayName: profile?.displayName ?? requester.handle,
            avatarUrl: profile?.avatarUrl,
          }
        : null,
    };
  },
});
