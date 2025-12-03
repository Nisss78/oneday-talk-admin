import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * 毎日JST 0時（UTC 15時）に前日のセッションを期限切れにする
 */
crons.daily(
  "expire daily sessions",
  { hourUTC: 15, minuteUTC: 0 }, // JST 0:00 = UTC 15:00
  internal.matching.expireSessions
);

export default crons;

