import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * 招待コードの有効性をチェック
 */
function isInviteCodeValid(community: {
  inviteCodeEnabled?: boolean;
  inviteCodeExpiresAt?: number;
  inviteCodeUsageLimit?: number;
  inviteCodeUsageCount?: number;
}): { valid: boolean; reason?: string } {
  // 招待コードが無効化されている
  if (community.inviteCodeEnabled === false) {
    return { valid: false, reason: "Invite code is disabled" };
  }

  // 有効期限切れ
  if (community.inviteCodeExpiresAt && community.inviteCodeExpiresAt < Date.now()) {
    return { valid: false, reason: "Invite code has expired" };
  }

  // 使用回数制限を超過
  if (
    community.inviteCodeUsageLimit !== undefined &&
    community.inviteCodeUsageLimit !== null &&
    (community.inviteCodeUsageCount ?? 0) >= community.inviteCodeUsageLimit
  ) {
    return { valid: false, reason: "Invite code usage limit reached" };
  }

  return { valid: true };
}

/**
 * 招待コードでコミュニティを検索（非メンバーでもアクセス可能）
 */
export const searchByInviteCode = query({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // 招待コードでコミュニティを検索
    const community = await ctx.db
      .query("communities")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", args.inviteCode.toUpperCase()))
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    if (!community) {
      return null;
    }

    // 招待コードの有効性チェック
    const inviteCodeValidity = isInviteCodeValid(community);

    // メンバー数をカウント
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", community._id).eq("status", "active")
      )
      .collect();

    // 既にメンバーかどうかチェック
    const existingMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", community._id).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    // 既にリクエスト済みかどうかチェック
    const existingRequest = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", community._id).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .unique();

    return {
      _id: community._id,
      name: community.name,
      description: community.description,
      avatarUrl: community.avatarUrl,
      memberCount: memberships.length,
      maxMembers: community.maxMembers,
      isMember: !!existingMembership,
      hasPendingRequest: !!existingRequest,
      isInviteCodeValid: inviteCodeValidity.valid,
      inviteCodeInvalidReason: inviteCodeValidity.reason,
      // 公式コミュニティ情報
      isOfficial: community.isOfficial || false,
      requiredEmailDomains: community.requiredEmailDomains || [],
    };
  },
});

/**
 * 招待コードで参加リクエストを送信
 */
export const requestJoin = mutation({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // 招待コードでコミュニティを検索
    const community = await ctx.db
      .query("communities")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", args.inviteCode.toUpperCase()))
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique();

    if (!community) {
      throw new Error("Invalid invite code");
    }

    // 招待コードの有効性チェック
    const inviteCodeValidity = isInviteCodeValid(community);
    if (!inviteCodeValidity.valid) {
      throw new Error(inviteCodeValidity.reason || "Invalid invite code");
    }

    // 既にメンバーかどうかチェック
    const existingMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", community._id).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (existingMembership) {
      throw new Error("You are already a member of this community");
    }

    // 既にpendingリクエストがあるかチェック
    const existingRequest = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", community._id).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .unique();

    if (existingRequest) {
      throw new Error("You already have a pending request for this community");
    }

    // メンバー上限チェック
    if (community.maxMembers) {
      const currentMembers = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", community._id).eq("status", "active")
        )
        .collect();

      if (currentMembers.length >= community.maxMembers) {
        throw new Error("This community has reached its maximum member limit");
      }
    }

    // 招待コードの使用回数をインクリメント
    await ctx.db.patch(community._id, {
      inviteCodeUsageCount: (community.inviteCodeUsageCount ?? 0) + 1,
      updatedAt: Date.now(),
    });

    // 参加リクエストを作成
    const requestId = await ctx.db.insert("communityJoinRequests", {
      communityId: community._id,
      userId: user._id,
      status: "pending",
      requestedAt: Date.now(),
    });

    return {
      requestId,
      communityName: community.name,
    };
  },
});

/**
 * 参加リクエストを承認（管理者のみ）
 */
export const approveRequest = mutation({
  args: {
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // リクエストを取得
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    // コミュニティを取得
    const community = await ctx.db.get(request.communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can approve requests");
    }

    // メンバー上限チェック
    if (community.maxMembers) {
      const currentMembers = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", request.communityId).eq("status", "active")
        )
        .collect();

      if (currentMembers.length >= community.maxMembers) {
        throw new Error("This community has reached its maximum member limit");
      }
    }

    const now = Date.now();

    // リクエストを承認済みに更新
    await ctx.db.patch(args.requestId, {
      status: "approved",
      respondedAt: now,
      respondedBy: user._id,
    });

    // メンバーシップを作成
    await ctx.db.insert("communityMemberships", {
      communityId: request.communityId,
      userId: request.userId,
      role: "member",
      status: "active",
      joinedAt: now,
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * 参加リクエストを拒否（管理者のみ）
 */
export const rejectRequest = mutation({
  args: {
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // リクエストを取得
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    // コミュニティを取得
    const community = await ctx.db.get(request.communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can reject requests");
    }

    // リクエストを拒否済みに更新
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      respondedAt: Date.now(),
      respondedBy: user._id,
    });

    return { success: true };
  },
});

/**
 * 自分の参加リクエストをキャンセル
 */
export const cancelRequest = mutation({
  args: {
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // リクエストを取得
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    // 自分のリクエストかチェック
    if (request.userId !== user._id) {
      throw new Error("Forbidden: You can only cancel your own requests");
    }

    if (request.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    // リクエストを削除
    await ctx.db.delete(args.requestId);

    return { success: true };
  },
});

/**
 * コミュニティの承認待ちリクエスト一覧（管理者用）
 */
export const listPendingRequests = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // コミュニティを取得
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can view pending requests");
    }

    // 承認待ちリクエストを取得
    const requests = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "pending")
      )
      .collect();

    // リクエストしたユーザーの情報を取得
    const requestsWithUsers = await Promise.all(
      requests.map(async (request) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", request.userId))
          .unique();

        const requestUser = await ctx.db.get(request.userId);

        return {
          _id: request._id,
          userId: request.userId,
          displayName: profile?.displayName || "Unknown",
          avatarUrl: profile?.avatarUrl || undefined,
          handle: requestUser?.handle || undefined,
          requestedAt: request.requestedAt,
        };
      })
    );

    // 申請日時でソート（新しい順）
    return {
      requests: requestsWithUsers.sort((a, b) => b.requestedAt - a.requestedAt),
    };
  },
});

/**
 * 自分の承認待ちリクエスト一覧
 */
export const getMyPendingRequests = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { requests: [] };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { requests: [] };
    }

    // 自分の承認待ちリクエストを取得
    const requests = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // コミュニティ情報を取得
    const requestsWithCommunities = await Promise.all(
      requests.map(async (request) => {
        const community = await ctx.db.get(request.communityId);

        return {
          _id: request._id,
          communityId: request.communityId,
          communityName: community?.name || "Unknown",
          communityAvatarUrl: community?.avatarUrl || undefined,
          communityDescription: community?.description || undefined,
          requestedAt: request.requestedAt,
        };
      })
    );

    // 申請日時でソート（新しい順）
    return {
      requests: requestsWithCommunities.sort((a, b) => b.requestedAt - a.requestedAt),
    };
  },
});

/**
 * 管理しているコミュニティの総承認待ちリクエスト数を取得
 */
export const getTotalPendingRequestsCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { count: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { count: 0 };
    }

    // 自分が管理しているコミュニティを取得
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("role"), "admin")
        )
      )
      .collect();

    // 各コミュニティの承認待ちリクエスト数をカウント
    let totalCount = 0;
    for (const membership of memberships) {
      const requests = await ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", membership.communityId).eq("status", "pending")
        )
        .collect();
      totalCount += requests.length;
    }

    return { count: totalCount };
  },
});
