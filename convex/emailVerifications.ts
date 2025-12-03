import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// 24時間の有効期限（ミリ秒）
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

// レート制限
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 3;
const MAX_REQUESTS_PER_USER_PER_DAY = 5;

/**
 * SHA-256ハッシュを生成（Convexのランタイムで使用可能）
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * メールアドレスからドメインを抽出
 */
function extractDomain(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts[1] || "";
}

/**
 * ドメインが許可リストに含まれるかチェック
 */
function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  const normalizedDomain = domain.toLowerCase();
  return allowedDomains.some(
    (allowed) => allowed.toLowerCase() === normalizedDomain
  );
}

/**
 * メール認証リクエストを送信
 */
export const requestVerification = mutation({
  args: {
    communityId: v.id("communities"),
    email: v.string(),
    purpose: v.union(v.literal("community_join"), v.literal("account_link")),
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
    if (!community || !community.isActive) {
      throw new Error("Community not found");
    }

    // 公式コミュニティかチェック
    if (!community.isOfficial || !community.requiredEmailDomains?.length) {
      throw new Error("This community does not require email verification");
    }

    // メールアドレスのフォーマット検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(args.email)) {
      throw new Error("Invalid email format");
    }

    // ドメインを抽出してチェック
    const domain = extractDomain(args.email);
    if (!isDomainAllowed(domain, community.requiredEmailDomains)) {
      throw new Error(
        `Email domain must be one of: ${community.requiredEmailDomains.join(", ")}`
      );
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // レート制限チェック: 同一メール（1時間）
    const recentEmailRequests = await ctx.db
      .query("emailVerifications")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .filter((q) => q.gt(q.field("createdAt"), oneHourAgo))
      .collect();

    if (recentEmailRequests.length >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
      throw new Error("Too many requests for this email. Please try again later.");
    }

    // レート制限チェック: 同一ユーザー（1日）
    const recentUserRequests = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id))
      .filter((q) => q.gt(q.field("createdAt"), oneDayAgo))
      .collect();

    if (recentUserRequests.length >= MAX_REQUESTS_PER_USER_PER_DAY) {
      throw new Error("Too many verification requests today. Please try again tomorrow.");
    }

    // 既に認証済みかチェック
    const existingVerified = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .filter((q) => q.eq(q.field("status"), "verified"))
      .unique();

    if (existingVerified) {
      throw new Error("Email already verified for this community");
    }

    // 既にメンバーかチェック
    const existingMembership = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (existingMembership && args.purpose === "community_join") {
      throw new Error("You are already a member of this community");
    }

    // トークンを生成
    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);

    // 既存のpending状態のリクエストを期限切れにする
    const existingPending = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const pending of existingPending) {
      await ctx.db.patch(pending._id, { status: "expired" });
    }

    // 新しい認証リクエストを作成
    const verificationId = await ctx.db.insert("emailVerifications", {
      userId: user._id,
      communityId: args.communityId,
      email: args.email.toLowerCase(),
      domain,
      tokenHash,
      purpose: args.purpose,
      status: "pending",
      expiresAt: now + TOKEN_EXPIRY_MS,
      createdAt: now,
    });

    // メール送信アクションをスケジュール
    await ctx.scheduler.runAfter(0, internal.email.sendVerificationEmail, {
      to: args.email,
      token,
      communityName: community.name,
      verificationId,
    });

    return {
      verificationId,
      email: args.email,
      expiresAt: now + TOKEN_EXPIRY_MS,
    };
  },
});

/**
 * トークンを検証してメンバーシップを作成
 */
export const verifyToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);

    // トークンハッシュで検索
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!verification) {
      throw new Error("Invalid verification token");
    }

    if (verification.status === "verified") {
      throw new Error("This token has already been used");
    }

    if (verification.status === "expired") {
      throw new Error("This verification link has expired");
    }

    const now = Date.now();
    if (verification.expiresAt < now) {
      await ctx.db.patch(verification._id, { status: "expired" });
      throw new Error("This verification link has expired");
    }

    // 認証を完了
    await ctx.db.patch(verification._id, {
      status: "verified",
      verifiedAt: now,
    });

    // コミュニティ参加の場合、メンバーシップを作成
    if (verification.purpose === "community_join" && verification.communityId) {
      const community = await ctx.db.get(verification.communityId);
      if (!community || !community.isActive) {
        throw new Error("Community not found");
      }

      // 既存のメンバーシップをチェック
      const existingMembership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", verification.communityId!).eq("userId", verification.userId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .unique();

      if (!existingMembership) {
        // メンバー上限チェック
        if (community.maxMembers) {
          const currentMembers = await ctx.db
            .query("communityMemberships")
            .withIndex("by_community_status", (q) =>
              q.eq("communityId", verification.communityId!).eq("status", "active")
            )
            .collect();

          if (currentMembers.length >= community.maxMembers) {
            throw new Error("This community has reached its maximum member limit");
          }
        }

        // メンバーシップを作成（完全自動承認）
        await ctx.db.insert("communityMemberships", {
          communityId: verification.communityId,
          userId: verification.userId,
          role: "member",
          status: "active",
          joinedAt: now,
          createdAt: now,
        });
      }

      return {
        success: true,
        communityId: verification.communityId,
        communityName: community.name,
        purpose: verification.purpose,
      };
    }

    return {
      success: true,
      communityId: verification.communityId,
      purpose: verification.purpose,
    };
  },
});

/**
 * 認証ステータスを確認
 */
export const getVerificationStatus = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    // 最新の認証リクエストを取得
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .order("desc")
      .first();

    if (!verification) {
      return { status: "none" as const };
    }

    // 期限切れをチェック
    if (verification.status === "pending" && verification.expiresAt < Date.now()) {
      return { status: "expired" as const, email: verification.email };
    }

    return {
      status: verification.status,
      email: verification.email,
      verifiedAt: verification.verifiedAt,
    };
  },
});

/**
 * 認証メールを再送信
 */
export const resendVerification = mutation({
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

    // 最新のpending認証を取得
    const verification = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_community", (q) =>
        q.eq("userId", user._id).eq("communityId", args.communityId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .order("desc")
      .first();

    if (!verification) {
      throw new Error("No pending verification found");
    }

    // 期限切れチェック
    if (verification.expiresAt < Date.now()) {
      throw new Error("Verification has expired. Please request a new one.");
    }

    // コミュニティを取得
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // 新しいトークンを生成
    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);
    const now = Date.now();

    // トークンを更新
    await ctx.db.patch(verification._id, {
      tokenHash,
      expiresAt: now + TOKEN_EXPIRY_MS,
    });

    // メール送信アクションをスケジュール
    await ctx.scheduler.runAfter(0, internal.email.sendVerificationEmail, {
      to: verification.email,
      token,
      communityName: community.name,
      verificationId: verification._id,
    });

    return {
      success: true,
      email: verification.email,
    };
  },
});

/**
 * 期限切れの認証を削除（cron用）
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 1週間以上前の期限切れ認証を削除
    const expiredVerifications = await ctx.db
      .query("emailVerifications")
      .withIndex("by_expires")
      .filter((q) =>
        q.and(
          q.lt(q.field("expiresAt"), oneWeekAgo),
          q.neq(q.field("status"), "verified")
        )
      )
      .collect();

    for (const verification of expiredVerifications) {
      await ctx.db.delete(verification._id);
    }

    return { deleted: expiredVerifications.length };
  },
});
