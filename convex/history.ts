import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUser } from "./auth";
import { getCurrentDateJST } from "./utils/dateUtils";
import { getTopicById, TOPIC_CATEGORY_ICONS } from "./topics";
import { Id } from "./_generated/dataModel";

/**
 * 会話履歴を取得（過去のセッション一覧）
 */
export const getConversationHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    // ユーザーが参加した全セッションを取得（userIdA または userIdB）
    const sessionsA = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_a", (q) => q.eq("userIdA", user._id))
      .order("desc")
      .take(limit);

    const sessionsB = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_b", (q) => q.eq("userIdB", user._id))
      .order("desc")
      .take(limit);

    // マージしてソート
    const allSessions = [...sessionsA, ...sessionsB].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    // 重複を除去してlimit件取得
    const uniqueSessions = allSessions
      .filter((session, index, self) =>
        index === self.findIndex((s) => s._id === session._id)
      )
      .slice(0, limit);

    // 相手の情報を取得
    const historyWithDetails = await Promise.all(
      uniqueSessions.map(async (session) => {
        const partnerId =
          session.userIdA === user._id ? session.userIdB : session.userIdA;

        const partner = await ctx.db.get(partnerId);
        const partnerProfile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", partnerId))
          .first();

        // そのセッションのメッセージ数を取得
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect();

        // 話題を取得（テキストはクライアント側で翻訳）
        const topic = session.topicId ? getTopicById(session.topicId) : null;

        return {
          sessionId: session._id,
          dateJst: session.dateJst,
          createdAt: session.createdAt,
          state: session.state,
          messageCount: messages.length,
          topic: topic ? {
            id: topic.id,
            category: topic.category,
            emoji: TOPIC_CATEGORY_ICONS[topic.category] || "💬"
          } : null,
          partner: {
            userId: partnerId,
            handle: partner?.handle || "",
            displayName: partnerProfile?.displayName || "Unknown",
            avatarUrl: partnerProfile?.avatarUrl || null,
          },
        };
      })
    );

    return historyWithDetails;
  },
});

/**
 * カレンダー用の会話データを取得（月単位）
 */
export const getCalendarData = query({
  args: {
    year: v.number(),
    month: v.number(), // 1-12
  },
  handler: async (ctx, { year, month }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { sessions: [], loginStreak: 0, totalMatchings: 0 };
    }

    // 月の範囲を計算（JST形式の日付文字列）
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    // その月のセッションを取得
    const sessionsA = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_a", (q) => q.eq("userIdA", user._id))
      .collect();

    const sessionsB = await ctx.db
      .query("dailySessions")
      .withIndex("by_user_b", (q) => q.eq("userIdB", user._id))
      .collect();

    // 全セッション（重複除去）
    const allSessionsUnique = [...sessionsA, ...sessionsB].filter(
      (session, index, self) =>
        index === self.findIndex((s) => s._id === session._id)
    );

    // 通算マッチング回数
    const totalMatchings = allSessionsUnique.length;

    // 今月のセッション
    const monthSessions = allSessionsUnique.filter(
      (session) => session.dateJst >= startDate && session.dateJst < endDate
    );

    // 相手の情報を取得
    const sessionsWithDetails = await Promise.all(
      monthSessions.map(async (session) => {
        const partnerId =
          session.userIdA === user._id ? session.userIdB : session.userIdA;

        const partnerProfile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", partnerId))
          .first();

        return {
          dateJst: session.dateJst,
          partnerName: partnerProfile?.displayName || "Unknown",
          partnerAvatarUrl: partnerProfile?.avatarUrl || null,
        };
      })
    );

    // 連続ログイン日数を計算
    const loginStreak = await calculateLoginStreak(ctx, user._id);

    return {
      sessions: sessionsWithDetails,
      loginStreak,
      totalMatchings,
    };
  },
});

/**
 * 連続ログイン（マッチング）日数を計算
 */
async function calculateLoginStreak(
  ctx: { db: any },
  userId: Id<"users">
): Promise<number> {
  // 全セッションを取得
  const sessionsA = await ctx.db
    .query("dailySessions")
    .withIndex("by_user_a", (q: any) => q.eq("userIdA", userId))
    .collect();

  const sessionsB = await ctx.db
    .query("dailySessions")
    .withIndex("by_user_b", (q: any) => q.eq("userIdB", userId))
    .collect();

  const allSessions = [...sessionsA, ...sessionsB];

  // 日付をユニークに取得してソート（降順）
  const uniqueDates = [
    ...new Set(allSessions.map((s) => s.dateJst)),
  ].sort().reverse();

  if (uniqueDates.length === 0) {
    return 0;
  }

  const today = getCurrentDateJST();
  let streak = 0;
  let currentDate = today;

  // 今日マッチングしているかチェック
  if (uniqueDates[0] !== today) {
    // 今日マッチングしていない場合、昨日からカウント
    const yesterday = getPreviousDate(today);
    if (uniqueDates[0] !== yesterday) {
      // 昨日もマッチングしていない場合、ストリーク終了
      return 0;
    }
    currentDate = yesterday;
  }

  // 連続日数をカウント
  for (const date of uniqueDates) {
    if (date === currentDate) {
      streak++;
      currentDate = getPreviousDate(currentDate);
    } else if (date < currentDate) {
      // 日付が飛んでいる場合はストリーク終了
      break;
    }
  }

  return streak;
}

/**
 * 前日の日付を取得（JST形式）
 */
function getPreviousDate(dateJst: string): string {
  const [year, month, day] = dateJst.split("-").map(Number);
  const date = new Date(year, month - 1, day - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 連続ログイン日数のみを取得
 */
export const getLoginStreak = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { streak: 0 };
    }

    const streak = await calculateLoginStreak(ctx, user._id);
    return { streak };
  },
});
