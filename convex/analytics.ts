import { v } from "convex/values";
import { query } from "./_generated/server";

// ========== ユーザー分析 ==========

// ユーザー登録トレンド
export const getUserRegistrationTrend = query({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 30;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const users = await ctx.db.query("users").collect();
    const filteredUsers = users.filter((u) => u.createdAt >= startDate);

    // 日付ごとにグループ化
    const groupedData: Record<string, number> = {};

    filteredUsers.forEach((user) => {
      const date = new Date(user.createdAt);
      let key: string;

      if (args.period === "daily") {
        key = date.toISOString().split("T")[0];
      } else if (args.period === "weekly") {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split("T")[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }

      groupedData[key] = (groupedData[key] || 0) + 1;
    });

    // ソートして配列に変換（累積カウント付き）
    const sorted = Object.entries(groupedData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 累積カウントを計算
    let cumulative = 0;
    const result = sorted.map((item) => {
      cumulative += item.count;
      return { ...item, cumulative };
    });

    return result;
  },
});

// アクティブユーザー率
export const getActiveUserRate = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const users = await ctx.db.query("users").collect();
    const totalUsers = users.length;

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const sessions = await ctx.db.query("dailySessions").collect();

    // 週間アクティブユーザー
    const weeklyActiveUserIds = new Set<string>();
    sessions
      .filter((s) => s.createdAt >= weekAgo)
      .forEach((s) => {
        weeklyActiveUserIds.add(s.userIdA);
        weeklyActiveUserIds.add(s.userIdB);
      });

    // 月間アクティブユーザー
    const monthlyActiveUserIds = new Set<string>();
    sessions
      .filter((s) => s.createdAt >= monthAgo)
      .forEach((s) => {
        monthlyActiveUserIds.add(s.userIdA);
        monthlyActiveUserIds.add(s.userIdB);
      });

    return {
      totalUsers,
      weeklyActiveUsers: weeklyActiveUserIds.size,
      monthlyActiveUsers: monthlyActiveUserIds.size,
      weeklyActiveRate: totalUsers > 0 ? (weeklyActiveUserIds.size / totalUsers) * 100 : 0,
      monthlyActiveRate: totalUsers > 0 ? (monthlyActiveUserIds.size / totalUsers) * 100 : 0,
    };
  },
});

// タグ分布
export const getTagDistribution = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const profiles = await ctx.db.query("profiles").collect();
    const tagCounts: Record<string, number> = {};

    profiles.forEach((profile) => {
      profile.tags?.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const sortedTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, args.limit || 20);

    return sortedTags;
  },
});

// プッシュ通知オプトイン率
export const getPushOptInRate = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const users = await ctx.db.query("users").collect();
    const total = users.length;
    const optedIn = users.filter((u) => u.pushToken).length;

    return {
      totalUsers: total,
      optedInUsers: optedIn,
      optInRate: total > 0 ? (optedIn / total) * 100 : 0,
    };
  },
});

// ========== エンゲージメント分析 ==========

// セッション完了率
export const getSessionCompletionRate = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 30;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const sessions = await ctx.db.query("dailySessions").collect();
    const recentSessions = sessions.filter((s) => s.createdAt >= startDate);

    const messages = await ctx.db.query("messages").collect();

    // 各セッションの完了状況をチェック（両者がメッセージを送った = 完了）
    let completedCount = 0;
    for (const session of recentSessions) {
      const sessionMessages = messages.filter((m) => m.sessionId === session._id);
      const senderIds = new Set(sessionMessages.map((m) => m.senderId));

      // 両者がメッセージを送っていれば完了
      if (senderIds.has(session.userIdA) && senderIds.has(session.userIdB)) {
        completedCount++;
      }
    }

    const total = recentSessions.length;
    const rate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    return {
      totalSessions: total,
      completedSessions: completedCount,
      completionRate: rate,
    };
  },
});

// セッションあたりの平均メッセージ数
export const getAverageMessagesPerSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const sessions = await ctx.db.query("dailySessions").collect();
    const messages = await ctx.db.query("messages").collect();

    // セッションごとのメッセージ数を集計
    const messageCountBySession: Record<string, number> = {};
    messages.forEach((m) => {
      const sessionId = m.sessionId as string;
      messageCountBySession[sessionId] = (messageCountBySession[sessionId] || 0) + 1;
    });

    const counts = Object.values(messageCountBySession);
    if (counts.length === 0) {
      return { averageMessages: 0, median: 0, min: 0, max: 0, totalSessions: sessions.length, totalMessages: 0 };
    }

    counts.sort((a, b) => a - b);
    const sum = counts.reduce((a, b) => a + b, 0);
    const averageMessages = sum / counts.length;
    const median = counts[Math.floor(counts.length / 2)];
    const min = counts[0];
    const max = counts[counts.length - 1];

    return {
      averageMessages,
      median,
      min,
      max,
      totalSessions: sessions.length,
      totalMessages: messages.length,
    };
  },
});

// 時間帯別利用状況（ヒートマップ用）
export const getUsageHeatmap = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 7;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const messages = await ctx.db.query("messages").collect();
    const recentMessages = messages.filter((m) => m.createdAt >= startDate);

    // 曜日 x 時間のマトリックスを作成
    const heatmapData: { dayOfWeek: number; hour: number; count: number }[] = [];
    const counts: Record<string, number> = {};

    recentMessages.forEach((m) => {
      const date = new Date(m.createdAt);
      const dayOfWeek = date.getDay(); // 0-6 (日-土)
      const hour = date.getHours(); // 0-23
      const key = `${dayOfWeek}-${hour}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    // 全ての曜日x時間の組み合わせを生成
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${dayOfWeek}-${hour}`;
        heatmapData.push({
          dayOfWeek,
          hour,
          count: counts[key] || 0,
        });
      }
    }

    return heatmapData;
  },
});

// 最もアクティブなユーザー
export const getMostActiveUsers = query({
  args: {
    limit: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 30;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const messages = await ctx.db.query("messages").collect();
    const recentMessages = messages.filter((m) => m.createdAt >= startDate);

    // ユーザーごとのメッセージ数を集計
    const messageCountByUser: Record<string, number> = {};
    recentMessages.forEach((m) => {
      const senderId = m.senderId as string;
      messageCountByUser[senderId] = (messageCountByUser[senderId] || 0) + 1;
    });

    // ソートして上位を取得
    const topUsers = Object.entries(messageCountByUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, args.limit || 20);

    // ユーザー情報を付与
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("profiles").collect();

    const result = topUsers.map(([userId, messageCount]) => {
      const user = users.find((u) => u._id === userId);
      const profile = user
        ? profiles.find((p) => p.userId === user._id)
        : null;

      return {
        userId,
        handle: user?.handle || "不明",
        name: profile?.displayName || "未設定",
        email: "",
        sessionCount: messageCount,
      };
    });

    return result;
  },
});

// 非アクティブユーザー
export const getInactiveUsers = query({
  args: {
    daysInactive: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const inactiveDays = args.daysInactive || 30;
    const now = Date.now();
    const threshold = now - inactiveDays * 24 * 60 * 60 * 1000;

    const users = await ctx.db.query("users").collect();
    const sessions = await ctx.db.query("dailySessions").collect();
    const messages = await ctx.db.query("messages").collect();

    // ユーザーごとの最終アクティビティを取得
    const lastActivity: Record<string, number> = {};

    sessions.forEach((s) => {
      const userAId = s.userIdA as string;
      const userBId = s.userIdB as string;
      lastActivity[userAId] = Math.max(lastActivity[userAId] || 0, s.createdAt);
      lastActivity[userBId] = Math.max(lastActivity[userBId] || 0, s.createdAt);
    });

    messages.forEach((m) => {
      const senderId = m.senderId as string;
      lastActivity[senderId] = Math.max(lastActivity[senderId] || 0, m.createdAt);
    });

    // 非アクティブユーザーを抽出
    const inactiveUsers = users.filter((u) => {
      const activity = lastActivity[u._id as string];
      return !activity || activity < threshold;
    });

    // プロファイル情報を付与
    const result = await Promise.all(
      inactiveUsers.slice(0, args.limit || 50).map(async (user) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        const activity = lastActivity[user._id as string];
        const daysSinceActive = activity
          ? Math.floor((now - activity) / (24 * 60 * 60 * 1000))
          : Math.floor((now - user.createdAt) / (24 * 60 * 60 * 1000));

        return {
          userId: user._id,
          handle: user.handle,
          name: profile?.displayName || "未設定",
          email: "",
          lastActivity: activity || null,
          daysSinceLastActive: daysSinceActive,
        };
      })
    );

    return result.sort((a, b) => b.daysSinceLastActive - a.daysSinceLastActive);
  },
});

// ========== コミュニティ分析 ==========

// コミュニティメンバー推移
export const getCommunityMemberTrends = query({
  args: {
    period: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const period = args.period || "daily";
    const daysToFetch = period === "daily" ? 30 : period === "weekly" ? 12 * 7 : 12 * 30;

    const communities = await ctx.db.query("communities").collect();
    const officialCommunities = communities.filter((c) => c.isOfficial).slice(0, args.limit || 5);
    const memberships = await ctx.db.query("communityMemberships").collect();

    const trends = await Promise.all(
      officialCommunities.map(async (community) => {
        const communityMemberships = memberships.filter(
          (m) => m.communityId === community._id && m.status === "active"
        );

        // 日付ごとにメンバー数を集計
        const now = Date.now();
        const data: { date: string; memberCount: number }[] = [];

        for (let i = daysToFetch - 1; i >= 0; i--) {
          const targetDate = new Date(now - i * 24 * 60 * 60 * 1000);
          let dateStr: string;

          if (period === "daily") {
            dateStr = targetDate.toISOString().split("T")[0];
          } else if (period === "weekly") {
            const weekStart = new Date(targetDate);
            weekStart.setDate(targetDate.getDate() - targetDate.getDay());
            dateStr = weekStart.toISOString().split("T")[0];
          } else {
            dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
          }

          const targetTimestamp = targetDate.getTime();

          // その日時点でのメンバー数を計算
          const memberCount = communityMemberships.filter(
            (m) => m.joinedAt <= targetTimestamp && (!m.leftAt || m.leftAt > targetTimestamp)
          ).length;

          // 同じ日付のデータが既にある場合はスキップ
          if (!data.find(d => d.date === dateStr)) {
            data.push({ date: dateStr, memberCount });
          }
        }

        return {
          communityId: community._id,
          communityName: community.name,
          data,
          currentMembers: communityMemberships.length,
        };
      })
    );

    return { trends };
  },
});

// 参加リクエスト承認率
export const getJoinRequestStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const joinRequests = await ctx.db.query("communityJoinRequests").collect();

    const total = joinRequests.length;
    const approved = joinRequests.filter((r) => r.status === "approved").length;
    const rejected = joinRequests.filter((r) => r.status === "rejected").length;
    const pending = joinRequests.filter((r) => r.status === "pending").length;

    return {
      total,
      approved,
      rejected,
      pending,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
    };
  },
});

// 招待コード効果
export const getInviteCodeStats = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const communities = await ctx.db.query("communities").collect();

    // communities テーブル内の招待コード情報を使用
    const result = communities
      .filter((c) => c.inviteCode && c.isActive)
      .map((community) => ({
        code: community.inviteCode,
        communityId: community._id,
        communityName: community.name,
        usageCount: community.inviteCodeUsageCount || 0,
        maxUses: community.inviteCodeUsageLimit || null,
        isActive: community.inviteCodeEnabled !== false,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, args.limit || 10);

    return result;
  },
});

// コミュニティ活動ランキング
export const getCommunityActivityRanking = query({
  args: {
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 30;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const communities = await ctx.db.query("communities").collect();
    const officialCommunities = communities.filter((c) => c.isOfficial);
    const sessions = await ctx.db.query("dailySessions").collect();
    const memberships = await ctx.db.query("communityMemberships").collect();
    const recentSessions = sessions.filter((s) => s.createdAt >= startDate);

    const result = officialCommunities.map((community) => {
      const communitySessions = recentSessions.filter(
        (s) => s.communityId === community._id
      );
      const communityMemberships = memberships.filter(
        (m) => m.communityId === community._id && m.status === "active"
      );

      return {
        communityId: community._id,
        name: community.name,
        sessionCount: communitySessions.length,
        memberCount: communityMemberships.length,
      };
    });

    return result.sort((a, b) => b.sessionCount - a.sessionCount).slice(0, args.limit || 10);
  },
});

// ========== エクスポート用クエリ ==========

// ユーザー一覧エクスポート
export const exportUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const users = await ctx.db.query("users").collect();

    const result = await Promise.all(
      users.map(async (user) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        return {
          id: user._id,
          handle: user.handle,
          clerkId: user.clerkId,
          displayName: profile?.displayName || "",
          tags: profile?.tags?.join(", ") || "",
          bio: profile?.bio || "",
          pushEnabled: user.pushToken ? "有効" : "無効",
          createdAt: new Date(user.createdAt).toISOString(),
        };
      })
    );

    return result;
  },
});

// コミュニティ一覧エクスポート
export const exportCommunities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const communities = await ctx.db.query("communities").collect();
    const memberships = await ctx.db.query("communityMemberships").collect();

    const result = communities.map((community) => {
      const communityMemberships = memberships.filter(
        (m) => m.communityId === community._id && m.status === "active"
      );

      return {
        id: community._id,
        name: community.name,
        isOfficial: community.isOfficial ? "公式" : "非公式",
        memberCount: communityMemberships.length,
        createdAt: new Date(community.createdAt).toISOString(),
      };
    });

    return result;
  },
});

// セッション履歴エクスポート
export const exportSessions = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 30;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const sessions = await ctx.db.query("dailySessions").collect();
    const recentSessions = sessions.filter((s) => s.createdAt >= startDate);
    const messages = await ctx.db.query("messages").collect();
    const communities = await ctx.db.query("communities").collect();
    const users = await ctx.db.query("users").collect();

    const result = recentSessions.map((session) => {
      const userA = users.find((u) => u._id === session.userIdA);
      const userB = users.find((u) => u._id === session.userIdB);
      const community = communities.find((c) => c._id === session.communityId);
      const sessionMessages = messages.filter((m) => m.sessionId === session._id);

      return {
        id: session._id,
        userA: userA?.handle || "不明",
        userB: userB?.handle || "不明",
        community: community?.name || "なし",
        messageCount: sessionMessages.length,
        status: session.state,
        createdAt: new Date(session.createdAt).toISOString(),
      };
    });

    return result;
  },
});

// メッセージ履歴エクスポート
export const exportMessages = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      throw new Error("管理者権限が必要です");
    }

    const daysToFetch = args.days || 7;
    const now = Date.now();
    const startDate = now - daysToFetch * 24 * 60 * 60 * 1000;

    const messages = await ctx.db.query("messages").collect();
    const recentMessages = messages.filter((m) => m.createdAt >= startDate);
    const users = await ctx.db.query("users").collect();

    const result = recentMessages.slice(0, 1000).map((message) => {
      const sender = users.find((u) => u._id === message.senderId);
      const text = message.text || "";

      return {
        id: message._id,
        sessionId: message.sessionId,
        sender: sender?.handle || "不明",
        content: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        createdAt: new Date(message.createdAt).toISOString(),
      };
    });

    return result;
  },
});
