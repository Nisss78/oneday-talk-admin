import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 管理者権限をチェックするヘルパー関数
async function requireAdmin(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new Error("認証が必要です");
  }

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_email", (q: any) => q.eq("email", identity.email!))
    .first();

  if (!admin) {
    throw new Error("管理者権限が必要です");
  }

  return { admin, email: identity.email };
}

// 通報理由のラベル
const REPORT_REASON_LABELS: Record<string, string> = {
  harassment: "嫌がらせ・ハラスメント",
  spam: "スパム・迷惑行為",
  inappropriate: "不適切なコンテンツ",
  other: "その他",
};

// ステータスのラベル
const STATUS_LABELS: Record<string, string> = {
  pending: "未対応",
  reviewed: "確認中",
  resolved: "解決済み",
  dismissed: "却下",
};

/**
 * 通報一覧を取得（管理者用）
 */
export const listReports = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("reviewed"),
        v.literal("resolved"),
        v.literal("dismissed"),
        v.literal("all")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      return [];
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!admin) {
      return [];
    }

    const limit = args.limit || 100;
    let reportsQuery;

    if (args.status && args.status !== "all") {
      reportsQuery = ctx.db
        .query("reports")
        .withIndex("by_status", (q) => q.eq("status", args.status as "pending" | "reviewed" | "resolved" | "dismissed"))
        .order("desc")
        .take(limit);
    } else {
      reportsQuery = ctx.db
        .query("reports")
        .withIndex("by_created")
        .order("desc")
        .take(limit);
    }

    const reports = await reportsQuery;

    // 通報者・被通報者の情報を取得
    const reportsWithDetails = await Promise.all(
      reports.map(async (report) => {
        const [reporter, reportedUser, reporterProfile, reportedProfile] = await Promise.all([
          ctx.db.get(report.reporterId),
          ctx.db.get(report.reportedUserId),
          ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", report.reporterId))
            .first(),
          ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", report.reportedUserId))
            .first(),
        ]);

        // レビューした管理者の情報
        let reviewedByAdmin = null;
        if (report.reviewedBy) {
          const reviewedByUser = await ctx.db.get(report.reviewedBy);
          if (reviewedByUser) {
            const reviewedByProfile = await ctx.db
              .query("profiles")
              .withIndex("by_user_id", (q) => q.eq("userId", report.reviewedBy!))
              .first();
            reviewedByAdmin = {
              handle: reviewedByUser.handle,
              displayName: reviewedByProfile?.displayName || reviewedByUser.handle,
            };
          }
        }

        return {
          _id: report._id,
          reporter: {
            userId: report.reporterId,
            handle: reporter?.handle || "",
            displayName: reporterProfile?.displayName || reporter?.handle || "",
            avatarUrl: reporterProfile?.avatarUrl || null,
          },
          reportedUser: {
            userId: report.reportedUserId,
            handle: reportedUser?.handle || "",
            displayName: reportedProfile?.displayName || reportedUser?.handle || "",
            avatarUrl: reportedProfile?.avatarUrl || null,
          },
          reason: report.reason,
          reasonLabel: REPORT_REASON_LABELS[report.reason] || report.reason,
          description: report.description,
          status: report.status,
          statusLabel: STATUS_LABELS[report.status] || report.status,
          adminNote: report.adminNote,
          reviewedBy: reviewedByAdmin,
          reviewedAt: report.reviewedAt,
          createdAt: report.createdAt,
        };
      })
    );

    return reportsWithDetails;
  },
});

/**
 * 通報のステータスを更新（管理者用）
 */
export const updateReportStatus = mutation({
  args: {
    reportId: v.id("reports"),
    status: v.union(
      v.literal("pending"),
      v.literal("reviewed"),
      v.literal("resolved"),
      v.literal("dismissed")
    ),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { admin } = await requireAdmin(ctx);

    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new Error("通報が見つかりません");
    }

    await ctx.db.patch(args.reportId, {
      status: args.status,
      adminNote: args.adminNote,
      reviewedBy: admin.userId,
      reviewedAt: Date.now(),
    });

    console.log(
      `[Admin] Report ${args.reportId} status updated to ${args.status} by ${admin.email}`
    );

    return { success: true };
  },
});

/**
 * 通報の統計を取得（管理者用）
 */
export const getReportStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      return null;
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!admin) {
      return null;
    }

    const allReports = await ctx.db.query("reports").collect();

    const stats = {
      total: allReports.length,
      pending: allReports.filter((r) => r.status === "pending").length,
      reviewed: allReports.filter((r) => r.status === "reviewed").length,
      resolved: allReports.filter((r) => r.status === "resolved").length,
      dismissed: allReports.filter((r) => r.status === "dismissed").length,
      byReason: {
        harassment: allReports.filter((r) => r.reason === "harassment").length,
        spam: allReports.filter((r) => r.reason === "spam").length,
        inappropriate: allReports.filter((r) => r.reason === "inappropriate").length,
        other: allReports.filter((r) => r.reason === "other").length,
      },
    };

    return stats;
  },
});

/**
 * ブロック一覧を取得（管理者用）
 */
export const listBlocks = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      return [];
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!admin) {
      return [];
    }

    const limit = args.limit || 100;
    const blocks = await ctx.db
      .query("userBlocks")
      .order("desc")
      .take(limit);

    const blocksWithDetails = await Promise.all(
      blocks.map(async (block) => {
        const [blocker, blocked, blockerProfile, blockedProfile] = await Promise.all([
          ctx.db.get(block.blockerId),
          ctx.db.get(block.blockedId),
          ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", block.blockerId))
            .first(),
          ctx.db
            .query("profiles")
            .withIndex("by_user_id", (q) => q.eq("userId", block.blockedId))
            .first(),
        ]);

        return {
          _id: block._id,
          blocker: {
            userId: block.blockerId,
            handle: blocker?.handle || "",
            displayName: blockerProfile?.displayName || blocker?.handle || "",
            avatarUrl: blockerProfile?.avatarUrl || null,
          },
          blocked: {
            userId: block.blockedId,
            handle: blocked?.handle || "",
            displayName: blockedProfile?.displayName || blocked?.handle || "",
            avatarUrl: blockedProfile?.avatarUrl || null,
          },
          createdAt: block.createdAt,
        };
      })
    );

    return blocksWithDetails;
  },
});
