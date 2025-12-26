import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * ランダムな招待コードを生成
 */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * コミュニティを作成
 * 運営またはフューチャーフラグ有効ユーザーのみ
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    avatarUrl: v.optional(v.string()),
    maxMembers: v.optional(v.number()),
    isOfficial: v.optional(v.boolean()),
    requiredEmailDomains: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // ユーザーを取得
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // バリデーション
    if (args.name.length < 1 || args.name.length > 50) {
      throw new Error("Invalid input: name must be 1-50 characters");
    }
    if (args.description.length < 1 || args.description.length > 200) {
      throw new Error("Invalid input: description must be 1-200 characters");
    }

    const now = Date.now();

    // 招待コードを生成
    const inviteCode = generateInviteCode();

    // コミュニティを作成
    const communityId = await ctx.db.insert("communities", {
      name: args.name,
      description: args.description,
      avatarUrl: args.avatarUrl,
      creatorId: user._id,
      adminIds: [user._id],
      isActive: true,
      inviteCode,
      inviteOnly: true,
      maxMembers: args.maxMembers,
      isOfficial: args.isOfficial,
      requiredEmailDomains: args.requiredEmailDomains,
      createdAt: now,
      updatedAt: now,
    });

    // 作成者を管理者として自動追加
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: user._id,
      role: "admin",
      status: "active",
      joinedAt: now,
      createdAt: now,
    });

    const community = await ctx.db.get(communityId);

    return {
      communityId,
      community,
    };
  },
});

/**
 * 自分が参加しているコミュニティ一覧を取得
 */
export const listMyCommunities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { communities: [] };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { communities: [] };
    }

    // アクティブなメンバーシップを取得
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // 各コミュニティの詳細情報を取得
    const communities = await Promise.all(
      memberships.map(async (membership) => {
        const community = await ctx.db.get(membership.communityId);
        if (!community || !community.isActive) {
          return null;
        }

        // メンバー数をカウント
        const allMemberships = await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_status", (q) =>
            q.eq("communityId", membership.communityId).eq("status", "active")
          )
          .collect();

        // 管理者の場合、承認待ちリクエスト数を取得
        let pendingRequestCount = 0;
        if (membership.role === 'admin') {
          const pendingRequests = await ctx.db
            .query("communityJoinRequests")
            .withIndex("by_community_status", (q) =>
              q.eq("communityId", membership.communityId).eq("status", "pending")
            )
            .collect();
          pendingRequestCount = pendingRequests.length;
        }

        return {
          _id: community._id,
          name: community.name,
          description: community.description,
          avatarUrl: community.avatarUrl,
          memberCount: allMemberships.length,
          myRole: membership.role,
          joinedAt: membership.joinedAt,
          createdAt: community.createdAt,
          isOfficial: community.isOfficial,
          pendingRequestCount,
        };
      })
    );

    // nullを除外してソート
    const validCommunities = communities
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { communities: validCommunities };
  },
});

/**
 * コミュニティの詳細情報を取得
 */
export const getById = query({
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

    // メンバーシップを確認
    const membership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    // メンバー数をカウント
    const allMemberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "active")
      )
      .collect();

    // メンバーでない場合は基本情報のみ返す
    if (!membership) {
      return {
        _id: community._id,
        name: community.name,
        description: community.description,
        avatarUrl: community.avatarUrl,
        creatorId: community.creatorId,
        adminIds: community.adminIds,
        isActive: community.isActive,
        isOfficial: community.isOfficial,
        requiredEmailDomains: community.requiredEmailDomains,
        maxMembers: community.maxMembers,
        memberCount: allMemberships.length,
        myRole: null,
        isCreator: false,
        isMember: false,
        joinedAt: null,
        createdAt: community.createdAt,
        updatedAt: community.updatedAt,
      };
    }

    return {
      _id: community._id,
      name: community.name,
      description: community.description,
      avatarUrl: community.avatarUrl,
      creatorId: community.creatorId,
      adminIds: community.adminIds,
      isActive: community.isActive,
      isOfficial: community.isOfficial,
      requiredEmailDomains: community.requiredEmailDomains,
      maxMembers: community.maxMembers,
      memberCount: allMemberships.length,
      myRole: membership.role,
      isCreator: community.creatorId === user._id,
      isMember: true,
      joinedAt: membership.joinedAt,
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    };
  },
});

/**
 * コミュニティの公開情報を取得（メンバーでなくても取得可能）
 * メール認証画面などで使用
 */
export const getPublicInfo = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !community.isActive) {
      return null;
    }

    // メンバー数をカウント
    const allMemberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_status", (q) =>
        q.eq("communityId", args.communityId).eq("status", "active")
      )
      .collect();

    return {
      _id: community._id,
      name: community.name,
      description: community.description,
      avatarUrl: community.avatarUrl,
      isOfficial: community.isOfficial,
      requiredEmailDomains: community.requiredEmailDomains,
      memberCount: allMemberships.length,
    };
  },
});

/**
 * コミュニティ情報を更新（管理者のみ）
 */
export const update = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    maxMembers: v.optional(v.number()),
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
      throw new Error("Forbidden: Only admins can update community");
    }

    // バリデーション
    if (args.name !== undefined && (args.name.length < 1 || args.name.length > 50)) {
      throw new Error("Invalid input: name must be 1-50 characters");
    }
    if (args.description !== undefined && (args.description.length < 1 || args.description.length > 200)) {
      throw new Error("Invalid input: description must be 1-200 characters");
    }

    // 更新
    await ctx.db.patch(args.communityId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.avatarUrl !== undefined && { avatarUrl: args.avatarUrl }),
      ...(args.maxMembers !== undefined && { maxMembers: args.maxMembers }),
      updatedAt: Date.now(),
    });

    const updatedCommunity = await ctx.db.get(args.communityId);

    return {
      success: true,
      community: updatedCommunity,
    };
  },
});

/**
 * コミュニティをアーカイブ（論理削除）
 */
export const archive = mutation({
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

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can archive community");
    }

    // アーカイブ
    await ctx.db.patch(args.communityId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * 招待コード設定を取得（管理者のみ）
 */
export const getInviteCodeSettings = query({
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

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can view invite code settings");
    }

    return {
      inviteCode: community.inviteCode,
      inviteCodeEnabled: community.inviteCodeEnabled ?? true,
      inviteCodeExpiresAt: community.inviteCodeExpiresAt,
      inviteCodeUsageLimit: community.inviteCodeUsageLimit,
      inviteCodeUsageCount: community.inviteCodeUsageCount ?? 0,
    };
  },
});

/**
 * 招待コードを再生成（管理者のみ）
 */
export const regenerateInviteCode = mutation({
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

    // 管理者権限チェック
    if (!community.adminIds.includes(user._id)) {
      throw new Error("Forbidden: Only admins can regenerate invite code");
    }

    const newInviteCode = generateInviteCode();

    await ctx.db.patch(args.communityId, {
      inviteCode: newInviteCode,
      inviteCodeUsageCount: 0, // 使用回数をリセット
      updatedAt: Date.now(),
    });

    return {
      success: true,
      inviteCode: newInviteCode,
    };
  },
});

/**
 * 招待コードを無効化/有効化（管理者のみ）
 */
export const toggleInviteCode = mutation({
  args: {
    communityId: v.id("communities"),
    enabled: v.boolean(),
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
      throw new Error("Forbidden: Only admins can toggle invite code");
    }

    await ctx.db.patch(args.communityId, {
      inviteCodeEnabled: args.enabled,
      updatedAt: Date.now(),
    });

    return { success: true, enabled: args.enabled };
  },
});

/**
 * 招待コードの設定を更新（有効期限・使用回数制限）（管理者のみ）
 */
export const updateInviteCodeSettings = mutation({
  args: {
    communityId: v.id("communities"),
    expiresInDays: v.optional(v.union(v.number(), v.null())), // null で無期限
    usageLimit: v.optional(v.union(v.number(), v.null())), // null で無制限
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
      throw new Error("Forbidden: Only admins can update invite code settings");
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      updatedAt: now,
    };

    // 有効期限の設定
    if (args.expiresInDays !== undefined) {
      if (args.expiresInDays === null) {
        updates.inviteCodeExpiresAt = undefined;
      } else {
        updates.inviteCodeExpiresAt = now + args.expiresInDays * 24 * 60 * 60 * 1000;
      }
    }

    // 使用回数制限の設定
    if (args.usageLimit !== undefined) {
      if (args.usageLimit === null) {
        updates.inviteCodeUsageLimit = undefined;
      } else {
        updates.inviteCodeUsageLimit = args.usageLimit;
      }
    }

    await ctx.db.patch(args.communityId, updates);

    const updatedCommunity = await ctx.db.get(args.communityId);

    return {
      success: true,
      inviteCodeExpiresAt: updatedCommunity?.inviteCodeExpiresAt,
      inviteCodeUsageLimit: updatedCommunity?.inviteCodeUsageLimit,
    };
  },
});

/**
 * コミュニティを削除（作成者のみ）
 * 関連するメンバーシップ、招待、参加リクエストも削除
 */
export const deleteCommunity = mutation({
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
      throw new Error("Community not found");
    }

    // 作成者のみ削除可能
    if (community.creatorId !== user._id) {
      throw new Error("Only the creator can delete this community");
    }

    // 公式コミュニティは削除不可
    if (community.isOfficial) {
      throw new Error("Official communities cannot be deleted");
    }

    // 関連するメンバーシップを削除
    const memberships = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    // 関連する招待を削除
    const invites = await ctx.db
      .query("communityInvites")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();

    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    // 関連する参加リクエストを削除
    const joinRequests = await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId))
      .collect();

    for (const request of joinRequests) {
      await ctx.db.delete(request._id);
    }

    // コミュニティを削除
    await ctx.db.delete(args.communityId);

    return { success: true };
  },
});
