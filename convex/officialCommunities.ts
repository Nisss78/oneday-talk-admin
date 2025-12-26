import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * 公式コミュニティの定義
 */
export const OFFICIAL_COMMUNITIES = [
  {
    id: "doshisha",
    name: "同志社大学",
    description: "同志社大学の学生・卒業生のためのコミュニティ",
    // mail.doshisha.ac.jp, mail2.doshisha.ac.jp, mail3.doshisha.ac.jp など番号付きも対応
    requiredEmailDomains: ["mail.doshisha.ac.jp", "mail2.doshisha.ac.jp", "mail3.doshisha.ac.jp", "doshisha.ac.jp"],
    iconEmoji: "🏫",
  },
  {
    id: "kyoto",
    name: "京都大学",
    description: "京都大学の学生・卒業生のためのコミュニティ",
    requiredEmailDomains: ["kyoto-u.ac.jp", "student.kyoto-u.ac.jp"],
    iconEmoji: "🎓",
  },
] as const;

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
 * 公式コミュニティを初期化（運営用・一度だけ実行）
 */
export const seedOfficialCommunities = internalMutation({
  args: {
    adminClerkId: v.string(), // 運営者のClerk ID
  },
  handler: async (ctx, args) => {
    // 運営者を取得
    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.adminClerkId))
      .unique();

    if (!adminUser) {
      throw new Error("Admin user not found");
    }

    const now = Date.now();
    const results = [];

    for (const community of OFFICIAL_COMMUNITIES) {
      // 既に存在するかチェック（名前で判定）
      const existing = await ctx.db
        .query("communities")
        .filter((q) =>
          q.and(
            q.eq(q.field("name"), community.name),
            q.eq(q.field("isOfficial"), true)
          )
        )
        .first();

      if (existing) {
        results.push({ id: community.id, status: "already_exists", communityId: existing._id });
        continue;
      }

      // 公式コミュニティを作成
      const communityId = await ctx.db.insert("communities", {
        name: community.name,
        description: community.description,
        creatorId: adminUser._id,
        adminIds: [adminUser._id],
        isActive: true,
        inviteCode: generateInviteCode(),
        inviteOnly: false, // 公式は招待不要（メール認証で参加）
        isOfficial: true,
        requiredEmailDomains: [...community.requiredEmailDomains],
        createdAt: now,
        updatedAt: now,
      });

      // 運営者を管理者として追加
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: adminUser._id,
        role: "admin",
        status: "active",
        joinedAt: now,
        createdAt: now,
      });

      results.push({ id: community.id, status: "created", communityId });
    }

    return results;
  },
});

/**
 * 公式コミュニティ一覧を取得（未参加でも表示）
 */
export const listOfficialCommunities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    // 公式コミュニティを取得
    const officialCommunities = await ctx.db
      .query("communities")
      .filter((q) =>
        q.and(
          q.eq(q.field("isOfficial"), true),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    // ユーザーのメンバーシップを取得
    let userMemberships: { communityId: any; status: string }[] = [];
    let userEmail: string | undefined;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (user) {
        userMemberships = await ctx.db
          .query("communityMemberships")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
      }

      // Clerkから取得したメールアドレス
      userEmail = identity.email ?? undefined;
    }

    // 各コミュニティの情報を整形
    const communities = await Promise.all(
      officialCommunities.map(async (community) => {
        // メンバー数をカウント
        const memberships = await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_status", (q) =>
            q.eq("communityId", community._id).eq("status", "active")
          )
          .collect();

        // ユーザーのメンバーシップ状態
        const membership = userMemberships.find(
          (m) => m.communityId === community._id
        );

        // メールドメインが一致するかチェック
        let canAutoJoin = false;
        if (userEmail && community.requiredEmailDomains) {
          const emailDomain = userEmail.split("@")[1]?.toLowerCase();
          canAutoJoin = community.requiredEmailDomains.some(
            (d) => d.toLowerCase() === emailDomain
          );
        }

        return {
          _id: community._id,
          name: community.name,
          description: community.description,
          avatarUrl: community.avatarUrl,
          isOfficial: true,
          requiredEmailDomains: community.requiredEmailDomains,
          memberCount: memberships.length,
          membershipStatus: membership?.status ?? null,
          canAutoJoin, // メールドメインが一致すれば自動参加可能
        };
      })
    );

    return { communities };
  },
});

/**
 * 公式コミュニティに参加（メールドメイン一致時の自動参加）
 */
export const joinOfficialCommunity = mutation({
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
    if (!community || !community.isActive) {
      throw new Error("Community not found");
    }

    if (!community.isOfficial) {
      throw new Error("This is not an official community");
    }

    // 既にメンバーかチェック
    const existingMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (existingMembership) {
      throw new Error("Already a member of this community");
    }

    // メールドメインをチェック
    const userEmail = identity.email;
    if (!userEmail) {
      throw new Error("Email not found. Please verify your email.");
    }

    const emailDomain = userEmail.split("@")[1]?.toLowerCase();
    const isValidDomain = community.requiredEmailDomains?.some(
      (d) => d.toLowerCase() === emailDomain
    );

    if (!isValidDomain) {
      // プライマリメールが一致しない場合、過去に認証されたメールがあるかチェック
      const verifiedEmails = await ctx.db
        .query("emailVerifications")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "verified")
        )
        .collect();

      // このコミュニティの必須ドメインで認証されたメールがあるか確認
      const hasVerifiedDomainEmail = verifiedEmails.some((v) =>
        community.requiredEmailDomains?.some(
          (d) => d.toLowerCase() === v.domain.toLowerCase()
        )
      );

      if (!hasVerifiedDomainEmail) {
        // 認証されたメールもない場合は、メール認証が必要
        throw new Error("EMAIL_VERIFICATION_REQUIRED");
      }
    }

    // メンバー上限チェック
    if (community.maxMembers) {
      const currentMembers = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", args.communityId).eq("status", "active")
        )
        .collect();

      if (currentMembers.length >= community.maxMembers) {
        throw new Error("This community has reached its maximum member limit");
      }
    }

    const now = Date.now();

    // メンバーシップを作成
    await ctx.db.insert("communityMemberships", {
      communityId: args.communityId,
      userId: user._id,
      role: "member",
      status: "active",
      joinedAt: now,
      createdAt: now,
    });

    return {
      success: true,
      communityName: community.name,
    };
  },
});

/**
 * 公式コミュニティを初期化（開発・運営用）
 * 本番環境では削除するか、適切な認証を追加すること
 */
export const initOfficialCommunities = mutation({
  args: {},
  handler: async (ctx) => {
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

    const now = Date.now();
    const results = [];

    for (const community of OFFICIAL_COMMUNITIES) {
      // 既に存在するかチェック（名前で判定）
      const existing = await ctx.db
        .query("communities")
        .filter((q) =>
          q.and(
            q.eq(q.field("name"), community.name),
            q.eq(q.field("isOfficial"), true)
          )
        )
        .first();

      if (existing) {
        results.push({ id: community.id, status: "already_exists", communityId: existing._id });
        continue;
      }

      // 公式コミュニティを作成
      const communityId = await ctx.db.insert("communities", {
        name: community.name,
        description: community.description,
        creatorId: user._id,
        adminIds: [user._id],
        isActive: true,
        inviteCode: generateInviteCode(),
        inviteOnly: false,
        isOfficial: true,
        requiredEmailDomains: [...community.requiredEmailDomains],
        createdAt: now,
        updatedAt: now,
      });

      // 運営者を管理者として追加
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: user._id,
        role: "admin",
        status: "active",
        joinedAt: now,
        createdAt: now,
      });

      results.push({ id: community.id, status: "created", communityId });
    }

    return results;
  },
});

/**
 * 開発用: 公式コミュニティのドメイン設定を更新
 * 本番環境では削除すること
 */
export const updateOfficialCommunityDomains = mutation({
  args: {},
  handler: async (ctx) => {
    const results = [];

    for (const communityDef of OFFICIAL_COMMUNITIES) {
      // 名前で公式コミュニティを検索
      const community = await ctx.db
        .query("communities")
        .filter((q) =>
          q.and(
            q.eq(q.field("name"), communityDef.name),
            q.eq(q.field("isOfficial"), true)
          )
        )
        .first();

      if (community) {
        await ctx.db.patch(community._id, {
          requiredEmailDomains: [...communityDef.requiredEmailDomains],
          updatedAt: Date.now(),
        });
        results.push({
          name: communityDef.name,
          status: "updated",
          domains: communityDef.requiredEmailDomains,
        });
      } else {
        results.push({
          name: communityDef.name,
          status: "not_found",
        });
      }
    }

    return results;
  },
});

/**
 * 開発用: 自分を全公式コミュニティから退会させる
 * 本番環境では削除すること
 */
export const leaveAllOfficialCommunities = mutation({
  args: {},
  handler: async (ctx) => {
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

    // 公式コミュニティを取得
    const officialCommunities = await ctx.db
      .query("communities")
      .filter((q) =>
        q.and(
          q.eq(q.field("isOfficial"), true),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    const results = [];

    for (const community of officialCommunities) {
      // メンバーシップを検索
      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", community._id).eq("userId", user._id)
        )
        .first();

      if (membership) {
        // adminIdsからも削除
        const updatedAdminIds = (community.adminIds || []).filter(
          (id) => id !== user._id
        );
        await ctx.db.patch(community._id, {
          adminIds: updatedAdminIds,
          updatedAt: Date.now(),
        });

        // メンバーシップを削除
        await ctx.db.delete(membership._id);
        results.push({
          communityName: community.name,
          status: "removed",
        });
      } else {
        results.push({
          communityName: community.name,
          status: "not_a_member",
        });
      }
    }

    return results;
  },
});

/**
 * メールアドレスから参加可能な公式コミュニティを判定
 */
export const getEligibleOfficialCommunities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) {
      return { communities: [] };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { communities: [] };
    }

    const emailDomain = identity.email.split("@")[1]?.toLowerCase();
    if (!emailDomain) {
      return { communities: [] };
    }

    // 公式コミュニティを取得
    const officialCommunities = await ctx.db
      .query("communities")
      .filter((q) =>
        q.and(
          q.eq(q.field("isOfficial"), true),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    // ドメインが一致するコミュニティをフィルタ
    const eligibleCommunities = officialCommunities.filter((community) =>
      community.requiredEmailDomains?.some(
        (d) => d.toLowerCase() === emailDomain
      )
    );

    // 既に参加しているかチェック
    const results = await Promise.all(
      eligibleCommunities.map(async (community) => {
        const membership = await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_user", (q) =>
            q.eq("communityId", community._id).eq("userId", user._id)
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .unique();

        return {
          _id: community._id,
          name: community.name,
          description: community.description,
          isAlreadyMember: !!membership,
        };
      })
    );

    return { communities: results };
  },
});
