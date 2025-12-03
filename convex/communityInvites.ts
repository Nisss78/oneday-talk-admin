import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * UUIDv4を生成
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * コミュニティにユーザーを招待
 */
export const create = mutation({
  args: {
    communityId: v.id("communities"),
    inviteeUserId: v.id("users"),
    expiresInDays: v.optional(v.number()), // 有効期限（日数）
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

    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // メンバー権限チェック（メンバーなら誰でも招待可能）
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!membership) {
      throw new Error("Forbidden: Only members can invite others");
    }

    // 既存のメンバーシップをチェック
    const existingMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", args.inviteeUserId)
      )
      .unique();

    if (existingMembership && existingMembership.status === "active") {
      throw new Error("User is already a member");
    }

    if (existingMembership && existingMembership.status === "invited") {
      throw new Error("User has already been invited");
    }

    // 最大メンバー数チェック
    if (community.maxMembers) {
      const activeMembers = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", args.communityId).eq("status", "active")
        )
        .collect();

      if (activeMembers.length >= community.maxMembers) {
        throw new Error("Community has reached maximum member limit");
      }
    }

    const now = Date.now();
    const expiresAt = args.expiresInDays
      ? now + args.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;

    // 招待を作成
    const inviteId = await ctx.db.insert("communityInvites", {
      communityId: args.communityId,
      inviterUserId: user._id,
      inviteeUserId: args.inviteeUserId,
      status: "pending",
      inviteCode: generateUUID(),
      expiresAt,
      createdAt: now,
    });

    // メンバーシップレコードを作成（invited状態）
    await ctx.db.insert("communityMemberships", {
      communityId: args.communityId,
      userId: args.inviteeUserId,
      role: "member",
      status: "invited",
      joinedAt: now,
      invitedBy: user._id,
      createdAt: now,
    });

    const invite = await ctx.db.get(inviteId);

    return {
      inviteId,
      invite,
    };
  },
});

/**
 * 自分への招待一覧を取得
 */
export const listMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { invites: [] };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { invites: [] };
    }

    // pending状態の招待を取得
    const invites = await ctx.db
      .query("communityInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeUserId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // コミュニティ情報と招待者情報を追加
    const invitesWithDetails = await Promise.all(
      invites.map(async (invite) => {
        const community = await ctx.db.get(invite.communityId);
        const inviter = await ctx.db.get(invite.inviterUserId);
        const inviterProfile = inviter
          ? await ctx.db
              .query("profiles")
              .withIndex("by_user_id", (q) => q.eq("userId", inviter._id))
              .unique()
          : null;

        // 期限切れチェック
        const isExpired = invite.expiresAt && invite.expiresAt < Date.now();

        return {
          _id: invite._id,
          community: community
            ? {
                _id: community._id,
                name: community.name,
                description: community.description,
                avatarUrl: community.avatarUrl,
              }
            : null,
          inviter: inviter && inviterProfile
            ? {
                userId: inviter._id,
                displayName: inviterProfile.displayName,
                avatarUrl: inviterProfile.avatarUrl,
              }
            : null,
          inviteCode: invite.inviteCode,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
          isExpired,
        };
      })
    );

    // 有効な招待のみフィルタリング
    const validInvites = invitesWithDetails
      .filter((inv) => !inv.isExpired && inv.community)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { invites: validInvites };
  },
});

/**
 * 招待を受諾
 */
export const accept = mutation({
  args: {
    inviteId: v.id("communityInvites"),
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

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.inviteeUserId !== user._id) {
      throw new Error("This invite is not for you");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite has already been responded to");
    }

    // 期限切れチェック
    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      await ctx.db.patch(args.inviteId, {
        status: "expired",
        respondedAt: Date.now(),
      });
      throw new Error("Invite has expired");
    }

    const now = Date.now();

    // 招待ステータスを更新
    await ctx.db.patch(args.inviteId, {
      status: "accepted",
      respondedAt: now,
    });

    // メンバーシップをactiveに更新
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", invite.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "invited"))
      .unique();

    if (membership) {
      await ctx.db.patch(membership._id, {
        status: "active",
        joinedAt: now,
      });
    }

    return { success: true };
  },
});

/**
 * 招待を拒否
 */
export const reject = mutation({
  args: {
    inviteId: v.id("communityInvites"),
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

    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.inviteeUserId !== user._id) {
      throw new Error("This invite is not for you");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite has already been responded to");
    }

    const now = Date.now();

    // 招待ステータスを更新
    await ctx.db.patch(args.inviteId, {
      status: "rejected",
      respondedAt: now,
    });

    // メンバーシップをleftに更新
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", invite.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "invited"))
      .unique();

    if (membership) {
      await ctx.db.patch(membership._id, {
        status: "left",
      });
    }

    return { success: true };
  },
});
