import { internalMutation } from "../_generated/server";
import { getYesterdayDateJST } from "../utils/dateUtils";

export const resetDailySessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 前日の日付を取得（JST）- 共通ユーティリティ使用
    const dateJst = getYesterdayDateJST();

    // 前日のセッションをexpiredに更新
    const sessions = await ctx.db
      .query("dailySessions")
      .withIndex("by_date", (q) => q.eq("dateJst", dateJst))
      .collect();

    for (const session of sessions) {
      await ctx.db.patch(session._id, {
        state: "expired",
      });
    }

    return { success: true, expiredCount: sessions.length };
  },
});

