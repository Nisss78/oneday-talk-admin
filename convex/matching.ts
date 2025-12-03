import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getCurrentUser } from "./auth";
import { getCurrentDateJST, isBeforeToday } from "./utils/dateUtils";
import { getRandomTopic } from "./topics";

/**
 * マッチングを開始
 * コミュニティIDが指定された場合はコミュニティマッチング、そうでなければ友達マッチング
 */
export const startMatching = mutation({
  args: {
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    const today = getCurrentDateJST();
    const matchType = args.communityId ? "community" : "friend";

    // コミュニティマッチングの場合、メンバーシップをチェック
    if (matchType === "community") {
      if (!args.communityId) {
        throw new Error("Community ID is required for community matching");
      }

      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", args.communityId!).eq("userId", user._id)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .unique();

      if (!membership) {
        throw new Error("You are not a member of this community");
      }

      const community = await ctx.db.get(args.communityId);
      if (!community || !community.isActive) {
        throw new Error("Community is not active");
      }
    }

    // 今日既に同じタイプのマッチングをしているかチェック
    const existingSessionA = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_match_type", (q) =>
        q.eq("dateJst", today).eq("userIdA", user._id).eq("matchType", matchType)
      )
      .first();

    const existingSessionB = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_b", (q) => q.eq("dateJst", today).eq("userIdB", user._id))
      .filter((q) => q.eq(q.field("matchType"), matchType))
      .first();

    if (existingSessionA || existingSessionB) {
      throw new Error(`Already matched today in ${matchType} mode`);
    }

    // マッチング候補を取得（友達 or コミュニティメンバー）
    let candidateUserIds: Array<import("./_generated/dataModel").Id<"users">>;

    if (matchType === "community") {
      if (!args.communityId) {
        throw new Error("Community ID is required for community matching");
      }

      // コミュニティマッチング：コミュニティの他のメンバーを取得
      const memberships = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_status", (q) =>
          q.eq("communityId", args.communityId!).eq("status", "active")
        )
        .collect();

      candidateUserIds = memberships
        .filter((m) => m.userId !== user._id)
        .map((m) => m.userId);

      if (candidateUserIds.length === 0) {
        throw new Error("No other members in this community");
      }
    } else {
      // 友達マッチング：友達リストを取得
      const sentFriendships = await ctx.db
        .query("friendships")
        .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
        .filter((q) => q.eq(q.field("status"), "accepted"))
        .collect();

      const receivedFriendships = await ctx.db
        .query("friendships")
        .withIndex("by_addressee", (q) => q.eq("addresseeId", user._id))
        .filter((q) => q.eq(q.field("status"), "accepted"))
        .collect();

      candidateUserIds = [
        ...sentFriendships.map((f) => f.addresseeId),
        ...receivedFriendships.map((f) => f.requesterId),
      ];

      if (candidateUserIds.length === 0) {
        throw new Error("No friends available for matching");
      }
    }

    // 今日まだマッチングしていない候補をフィルタリング
    const todaysSessions = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_match_type", (q) => q.eq("dateJst", today).eq("matchType", matchType))
      .collect();

    // マッチ済みのユーザーIDをSetに格納（O(1)検索）
    const matchedUserIds = new Set<string>();
    for (const session of todaysSessions) {
      matchedUserIds.add(session.userIdA);
      matchedUserIds.add(session.userIdB);
    }

    // マッチ済みでない候補のみをフィルタリング
    const availableCandidates = candidateUserIds.filter(
      (candidateId) => !matchedUserIds.has(candidateId)
    );

    if (availableCandidates.length === 0) {
      const errorMsg = matchType === "community"
        ? "No available members (all already matched today)"
        : "No available friends (all already matched)";
      throw new Error(errorMsg);
    }

    // ランダムに1人選択
    const randomIndex = Math.floor(Math.random() * availableCandidates.length);
    const matchedUserId = availableCandidates[randomIndex];

    // セッションを作成（今日の話題を割り当て）
    const createdAt = Date.now();
    const todayTopic = getRandomTopic();
    const sessionId = await ctx.db.insert("dailySessions", {
      dateJst: today,
      userIdA: user._id,
      userIdB: matchedUserId,
      state: "active",
      createdAt,
      matchType,
      communityId: args.communityId,
      topicId: todayTopic.id,
    });

    // 競合状態チェック: 同じユーザーの同じmatchTypeの重複セッションがないか確認
    // Convexの楽観的同時実行制御によりこのチェックは通常不要だが、安全のため
    const allUserSessionsA = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_match_type", (q) =>
        q.eq("dateJst", today).eq("userIdA", user._id).eq("matchType", matchType)
      )
      .collect();

    const allUserSessionsB = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_b", (q) => q.eq("dateJst", today).eq("userIdB", user._id))
      .filter((q) => q.eq(q.field("matchType"), matchType))
      .collect();

    const allUserSessions = [...allUserSessionsA, ...allUserSessionsB];

    // 自分が作成したセッション以外に同日のセッションがある場合
    if (allUserSessions.length > 1) {
      // 最も古いセッションを残し、今作成したセッションを削除
      const oldestSession = allUserSessions.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest
      );

      if (oldestSession._id !== sessionId) {
        // 今作成したセッションを削除
        await ctx.db.delete(sessionId);

        // 既存のセッションの相手情報を取得して返す
        const existingMatchedUserId = oldestSession.userIdA === user._id
          ? oldestSession.userIdB
          : oldestSession.userIdA;

        const existingMatchedFriend = await ctx.db.get(existingMatchedUserId);
        const existingMatchedProfile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", existingMatchedUserId))
          .first();

        return {
          sessionId: oldestSession._id,
          matchedUser: {
            userId: existingMatchedUserId,
            handle: existingMatchedFriend?.handle || "",
            displayName: existingMatchedProfile?.displayName || "",
            avatarUrl: existingMatchedProfile?.avatarUrl || null,
          },
        };
      }
    }

    // マッチしたユーザーの情報を取得
    const matchedUserDoc = await ctx.db.get(matchedUserId);
    const matchedProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", matchedUserId))
      .first();

    return {
      sessionId,
      matchedUser: {
        userId: matchedUserId,
        handle: matchedUserDoc?.handle || "",
        displayName: matchedProfile?.displayName || "",
        avatarUrl: matchedProfile?.avatarUrl || null,
      },
      matchType,
      communityId: args.communityId,
    };
  },
});

/**
 * 今日のマッチング状態を取得
 */
export const getTodayMatch = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const today = getCurrentDateJST();

    // 複合インデックスを使用してセッションを検索
    const sessionA = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_a", (q) => q.eq("dateJst", today).eq("userIdA", user._id))
      .filter((q) => q.eq(q.field("state"), "active"))
      .first();

    const sessionB = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_b", (q) => q.eq("dateJst", today).eq("userIdB", user._id))
      .filter((q) => q.eq(q.field("state"), "active"))
      .first();

    const session = sessionA || sessionB;

    if (!session) {
      return null;
    }

    // マッチした相手のIDを取得
    const matchedUserId = session.userIdA === user._id ? session.userIdB : session.userIdA;

    // 相手の情報を取得
    const matchedUser = await ctx.db.get(matchedUserId);
    const matchedProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", matchedUserId))
      .first();

    return {
      sessionId: session._id,
      matchedUser: {
        userId: matchedUserId,
        handle: matchedUser?.handle || "",
        displayName: matchedProfile?.displayName || "",
        avatarUrl: matchedProfile?.avatarUrl || null,
        bio: matchedProfile?.bio || null,
        tags: matchedProfile?.tags || [],
        topics: matchedProfile?.topics || [],
        photoStories: matchedProfile?.photoStories || [],
        instagramUrl: matchedProfile?.instagramUrl || null,
      },
      matchType: session.matchType || "friend",
      communityId: session.communityId,
      createdAt: session.createdAt,
    };
  },
});

/**
 * マッチング可能かチェック
 */
export const canMatch = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { canMatch: false, reason: "authRequired" };
    }

    const today = getCurrentDateJST();

    // 今日既にマッチングしているかチェック（複合インデックス使用）
    const existingSessionA = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_a", (q) => q.eq("dateJst", today).eq("userIdA", user._id))
      .first();

    const existingSessionB = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_b", (q) => q.eq("dateJst", today).eq("userIdB", user._id))
      .first();

    if (existingSessionA || existingSessionB) {
      return { canMatch: false, reason: "alreadyMatched" };
    }

    // 友達数をチェック
    const sentFriendships = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    const receivedFriendships = await ctx.db
      .query("friendships")
      .withIndex("by_addressee", (q) => q.eq("addresseeId", user._id))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    const friendCount = sentFriendships.length + receivedFriendships.length;

    if (friendCount === 0) {
      return { canMatch: false, reason: "noFriends" };
    }

    // 友達IDリストを作成
    const friendIds = [
      ...sentFriendships.map((f) => f.addresseeId),
      ...receivedFriendships.map((f) => f.requesterId),
    ];

    // 今日マッチング可能な友達がいるかチェック
    const todaysSessions = await ctx.db
      .query("dailySessions")
      .withIndex("by_date", (q) => q.eq("dateJst", today))
      .collect();

    const matchedUserIds = new Set<string>();
    for (const session of todaysSessions) {
      matchedUserIds.add(session.userIdA);
      matchedUserIds.add(session.userIdB);
    }

    const availableFriends = friendIds.filter(
      (friendId) => !matchedUserIds.has(friendId)
    );

    if (availableFriends.length === 0) {
      return { canMatch: false, reason: "allFriendsMatched" };
    }

    return { canMatch: true };
  },
});

/**
 * 前日のセッションを期限切れにする（Cron Job用）
 */
export const expireSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = getCurrentDateJST();

    // 今日より前の日付のアクティブセッションを取得
    const activeSessions = await ctx.db
      .query("dailySessions")
      .withIndex("by_state", (q) => q.eq("state", "active"))
      .collect();

    let expiredCount = 0;
    for (const session of activeSessions) {
      if (session.dateJst < today) {
        await ctx.db.patch(session._id, { state: "expired" });
        expiredCount++;
      }
    }

    console.log(`Expired ${expiredCount} sessions at JST midnight`);
    return { expiredCount };
  },
});

/**
 * 今日のすべてのマッチングを取得（友達・コミュニティ両方）
 */
export const getAllTodayMatches = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { matches: [] };
    }

    const today = getCurrentDateJST();

    // 自分が関係するすべてのセッションを取得
    const sessionsA = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_a", (q) => q.eq("dateJst", today).eq("userIdA", user._id))
      .filter((q) => q.eq(q.field("state"), "active"))
      .collect();

    const sessionsB = await ctx.db
      .query("dailySessions")
      .withIndex("by_date_user_b", (q) => q.eq("dateJst", today).eq("userIdB", user._id))
      .filter((q) => q.eq(q.field("state"), "active"))
      .collect();

    const allSessions = [...sessionsA, ...sessionsB];

    // 各セッションのマッチ情報を取得
    const matches = await Promise.all(
      allSessions.map(async (session) => {
        const matchedUserId = session.userIdA === user._id ? session.userIdB : session.userIdA;
        const matchedUser = await ctx.db.get(matchedUserId);
        const matchedProfile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", matchedUserId))
          .first();

        // コミュニティ名を取得
        let communityName = null;
        if (session.communityId) {
          const community = await ctx.db.get(session.communityId);
          communityName = community?.name || null;
        }

        // 最新メッセージを取得
        const latestMessage = await ctx.db
          .query("messages")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .order("desc")
          .first();

        // 未読メッセージ数を取得
        const unreadMessages = await ctx.db
          .query("messages")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .filter((q) =>
            q.and(
              q.neq(q.field("senderId"), user._id),
              q.not(q.eq(q.field("readBy"), undefined))
            )
          )
          .collect();

        // 自分が読んでいないメッセージをカウント
        const unreadCount = unreadMessages.filter(
          (msg) => !msg.readBy?.includes(user._id)
        ).length;

        return {
          sessionId: session._id,
          matchType: session.matchType || "friend",
          communityId: session.communityId,
          communityName,
          matchedUser: {
            userId: matchedUserId,
            handle: matchedUser?.handle || "",
            displayName: matchedProfile?.displayName || "",
            avatarUrl: matchedProfile?.avatarUrl || null,
            tags: matchedProfile?.tags || [],
            bio: matchedProfile?.bio || null,
          },
          unreadCount,
          latestMessage: latestMessage
            ? {
                content: latestMessage.type === "stamp"
                  ? "スタンプを送信しました"
                  : latestMessage.text,
                createdAt: latestMessage.createdAt,
              }
            : null,
          createdAt: session.createdAt,
          dateJst: session.dateJst, // セッションの日付（JST）- 残り時間表示用
        };
      })
    );

    // 最新メッセージの時刻でソート（新しい順）
    matches.sort((a, b) => {
      const aTime = a.latestMessage?.createdAt || a.createdAt;
      const bTime = b.latestMessage?.createdAt || b.createdAt;
      return bTime - aTime;
    });

    return { matches };
  },
});

/**
 * セッションIDでセッション詳細を取得
 */
export const getSessionById = query({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return null;
    }

    // 自分がこのセッションに参加しているかチェック
    if (session.userIdA !== user._id && session.userIdB !== user._id) {
      return null;
    }

    // マッチした相手のIDを取得
    const matchedUserId = session.userIdA === user._id ? session.userIdB : session.userIdA;

    // 相手の情報を取得
    const matchedUser = await ctx.db.get(matchedUserId);
    const matchedProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", matchedUserId))
      .first();

    return {
      sessionId: session._id,
      matchedUser: {
        userId: matchedUserId,
        handle: matchedUser?.handle || "",
        displayName: matchedProfile?.displayName || "",
        avatarUrl: matchedProfile?.avatarUrl || null,
      },
      matchType: session.matchType || "friend",
      communityId: session.communityId,
      state: session.state,
      createdAt: session.createdAt,
      dateJst: session.dateJst, // セッションの日付（JST）- カウントダウン表示用
    };
  },
});
