import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * コミュニティのメンバー一覧を取得
 */
export const listMembers = query({
  args: {
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
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

    // メンバーシップを確認
    const myMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!myMembership) {
      throw new Error("Forbidden: You are not a member of this community");
    }

    // メンバー一覧を取得
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "active")
      )
      .collect();

    // プロフィール情報を取得
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", membership.userId))
          .unique();

        return {
          userId: membership.userId,
          displayName: profile?.displayName || "Unknown",
          avatarUrl: profile?.avatarUrl || undefined,
          role: membership.role,
          joinedAt: membership.joinedAt,
        };
      })
    );

    // ソート（管理者優先 → 参加日時降順）
    const sortedMembers = members.sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (a.role !== "admin" && b.role === "admin") return 1;
      return b.joinedAt - a.joinedAt;
    });

    // ページネーション
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const paginatedMembers = sortedMembers.slice(offset, offset + limit);

    return {
      members: paginatedMembers,
      total: sortedMembers.length,
      hasMore: offset + limit < sortedMembers.length,
    };
  },
});

/**
 * コミュニティから退会
 */
export const leave = mutation({
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

    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("Not found");
    }

    // 作成者は退会不可（ただし公式コミュニティは例外）
    if (community.creatorId === user._id && !community.isOfficial) {
      throw new Error("Creator cannot leave their own community");
    }

    // メンバーシップを取得
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!membership) {
      throw new Error("You are not a member of this community");
    }

    // ステータスを退会済みに更新
    await ctx.db.patch(membership._id, {
      status: "left",
    });

    // 管理者だった場合、adminIdsから削除
    if (community.adminIds.includes(user._id)) {
      await ctx.db.patch(args.communityId, {
        adminIds: community.adminIds.filter((id) => id !== user._id),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * メンバーをコミュニティから削除（管理者のみ）
 */
export const removeMember = mutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
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
      throw new Error("Not found");
    }

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can remove members");
    }

    // 作成者は削除不可
    if (community.creatorId === args.userId) {
      throw new Error("Cannot remove the community creator");
    }

    // 対象メンバーのメンバーシップを取得
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!membership) {
      throw new Error("User is not a member of this community");
    }

    // ステータスを退会済みに更新
    await ctx.db.patch(membership._id, {
      status: "left",
    });

    // 管理者だった場合、adminIdsから削除
    if (community.adminIds.includes(args.userId)) {
      await ctx.db.patch(args.communityId, {
        adminIds: community.adminIds.filter((id) => id !== args.userId),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * メンバーを管理者に昇格（管理者のみ）
 */
export const promoteToAdmin = mutation({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
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
      throw new Error("Not found");
    }

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can promote members");
    }

    // 対象メンバーのメンバーシップを取得
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (!membership) {
      throw new Error("User is not a member of this community");
    }

    if (membership.role === "admin") {
      throw new Error("User is already an admin");
    }

    // ロールを管理者に更新
    await ctx.db.patch(membership._id, {
      role: "admin",
    });

    // adminIdsに追加
    await ctx.db.patch(args.communityId, {
      adminIds: [...community.adminIds, args.userId],
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
