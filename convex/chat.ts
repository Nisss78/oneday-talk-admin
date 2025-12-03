import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./auth";
import { sanitizeString, validateMessage } from "./validation";
import { internal } from "./_generated/api";
import { getCurrentDateJST } from "./utils/dateUtils";
import { getStampById, getStampEmoji, isValidStampId, STAMPS } from "./stamps";
import { getTopicById, getRandomTopic } from "./topics";

/**
 * セッションのメッセージを取得（ページネーション対応）
 */
export const getMessages = query({
  args: {
    sessionId: v.id("dailySessions"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("messages")),
  },
  handler: async (ctx, { sessionId, limit = 50, cursor }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.error("[getMessages] Authentication required");
      throw new Error("Authentication required");
    }

    // セッションの確認
    const session = await ctx.db.get(sessionId);
    if (!session) {
      console.error("[getMessages] Session not found:", { sessionId, userId: user._id });
      throw new Error("Session not found");
    }

    // セッションが有効か確認（activeかつユーザーが参加者か）
    if (session.state !== "active") {
      console.error("[getMessages] Session has ended:", {
        sessionId,
        state: session.state,
        userId: user._id,
      });
      throw new Error("Session has ended");
    }

    // 参加者チェックの詳細ログ
    const isUserA = session.userIdA === user._id;
    const isUserB = session.userIdB === user._id;
    const isParticipant = isUserA || isUserB;

    console.log("[getMessages] Participant check:", {
      sessionId,
      userId: user._id,
      userIdA: session.userIdA,
      userIdB: session.userIdB,
      isUserA,
      isUserB,
      isParticipant,
    });

    if (!isParticipant) {
      console.error("[getMessages] No permission to access this session:", {
        sessionId,
        userId: user._id,
        userIdA: session.userIdA,
        userIdB: session.userIdB,
      });
      throw new Error("No permission to access this session");
    }

    // メッセージを取得（カーソルベースのページネーション対応）
    // 最大100件まで取得可能、デフォルト50件
    const safeLimit = Math.min(Math.max(1, limit), 100);

    let messagesQuery = ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc");

    // カーソルが指定されている場合、そのメッセージより後のメッセージを取得
    let allMessages = await messagesQuery.collect();

    console.log("[getMessages] Messages retrieved:", {
      sessionId,
      totalMessages: allMessages.length,
      cursor,
    });

    // カーソルでフィルタリング
    let messages = allMessages;
    if (cursor) {
      const cursorIndex = allMessages.findIndex(m => m._id === cursor);
      if (cursorIndex !== -1) {
        // カーソルの次のメッセージから取得
        messages = allMessages.slice(cursorIndex + 1);
      }
    }

    // ページネーション処理
    const hasMore = messages.length > safeLimit;
    const paginatedMessages = hasMore ? messages.slice(0, safeLimit) : messages;
    const nextCursor = hasMore ? paginatedMessages[paginatedMessages.length - 1]._id : null;

    // 送信者情報を一括取得（N+1問題の解決）
    const uniqueSenderIds = [...new Set(paginatedMessages.map(m => m.senderId))];

    // 一括でユーザーとプロフィールを取得
    const [senders, profiles] = await Promise.all([
      Promise.all(uniqueSenderIds.map(id => ctx.db.get(id))),
      Promise.all(uniqueSenderIds.map(id =>
        ctx.db.query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", id))
          .first()
      ))
    ]);

    // マップを作成してO(1)でアクセス
    const senderMap = Object.fromEntries(
      uniqueSenderIds.map((id, i) => [id.toString(), senders[i]])
    );
    const profileMap = Object.fromEntries(
      uniqueSenderIds.map((id, i) => [id.toString(), profiles[i]])
    );

    // 送信者情報とスタンプ情報を付加
    const messagesWithSenders = paginatedMessages.map((message) => {
      const sender = senderMap[message.senderId.toString()];
      const senderProfile = profileMap[message.senderId.toString()];
      const messageType = message.type ?? "text";

      // スタンプメッセージの場合、絵文字を取得
      let stampEmoji: string | undefined;
      if (messageType === "stamp" && message.stampId) {
        stampEmoji = getStampEmoji(message.stampId);
      }

      return {
        _id: message._id,
        content: message.text,
        senderId: message.senderId,
        senderName: senderProfile?.displayName || sender?.handle || "Unknown",
        createdAt: message.createdAt,
        isOwnMessage: message.senderId === user._id,
        readBy: message.readBy || [],
        // Enhancements: スタンプ情報
        type: messageType,
        stampId: message.stampId,
        stampEmoji,
        // Enhancements: ゲーム招待情報
        gameType: message.gameType,
        gameId: message.gameId,
        senderMbti: message.senderMbti,
        // Enhancements: ゲーム結果情報
        gameResult: message.gameResult,
      };
    });

    return {
      messages: messagesWithSenders,
      hasMore,
      nextCursor,
    };
  },
});

/**
 * 未読メッセージ数を取得
 */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return 0;
    }

    // 今日のアクティブなセッションを取得（複合インデックス使用）
    const today = getCurrentDateJST();

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
      return 0;
    }

    // 相手から送られた未読メッセージの数をカウント
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .filter((q) => q.neq(q.field("senderId"), user._id))
      .collect();

    // readByに自分が含まれていないメッセージをカウント
    const unreadMessages = messages.filter(
      (msg) => !(msg.readBy || []).includes(user._id)
    );

    return unreadMessages.length;
  },
});

/**
 * メッセージを既読にする
 */
export const markMessagesAsRead = mutation({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    // セッションの確認
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // セッションが有効か確認
    if (session.state !== "active") {
      throw new Error("Session has ended");
    }

    // ユーザーがセッションの参加者か確認
    if (session.userIdA !== user._id && session.userIdB !== user._id) {
      throw new Error("No permission to access this session");
    }

    // 未読メッセージを取得
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.neq(q.field("senderId"), user._id))
      .collect();

    // readByに自分が含まれていないメッセージを既読にする
    // バッチ更新でパフォーマンスを改善
    const updatePromises = messages
      .filter((message) => {
        const readBy = message.readBy || [];
        return !readBy.includes(user._id);
      })
      .map((message) => {
        const readBy = message.readBy || [];
        // 既存の重複も除去しつつ、自分を追加
        const uniqueReadBy = [...new Set([...readBy, user._id])];
        return ctx.db.patch(message._id, {
          readBy: uniqueReadBy,
        });
      });

    // すべての更新を並行実行
    await Promise.all(updatePromises);

    return { count: updatePromises.length };
  },
});

/**
 * 既存メッセージにreadByフィールドを追加するマイグレーション
 * 開発環境でのみ実行してください
 */
export const migrateAddReadByField = mutation({
  args: {},
  handler: async (ctx) => {
    // すべてのメッセージを取得
    const allMessages = await ctx.db.query("messages").collect();

    let migratedCount = 0;
    for (const message of allMessages) {
      // readByフィールドがない、またはundefinedの場合
      if (!message.readBy) {
        // 送信者のみが既読として設定
        await ctx.db.patch(message._id, {
          readBy: [message.senderId],
        });
        migratedCount++;
      }
    }

    return {
      total: allMessages.length,
      migrated: migratedCount,
      message: `${migratedCount}件のメッセージにreadByフィールドを追加しました`
    };
  },
});

/**
 * メッセージを送信（テキスト・スタンプ両対応）
 */
export const sendMessage = mutation({
  args: {
    sessionId: v.id("dailySessions"),
    content: v.string(),
    // Enhancements: スタンプ対応
    type: v.optional(v.union(v.literal("text"), v.literal("stamp"))),
    stampId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, content, type, stampId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    const messageType = type ?? "text";

    // メッセージタイプ別バリデーション
    if (messageType === "stamp") {
      // スタンプメッセージのバリデーション
      if (!stampId) {
        throw new Error("MISSING_STAMP_ID");
      }
      if (!isValidStampId(stampId)) {
        throw new Error("INVALID_STAMP_ID");
      }

    } else {
      // テキストメッセージのバリデーション
      const validation = validateMessage(content);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    // セッションの確認
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // セッションが有効か確認
    if (session.state !== "active") {
      throw new Error("Session has ended");
    }

    // ユーザーがセッションの参加者か確認
    if (session.userIdA !== user._id && session.userIdB !== user._id) {
      throw new Error("No permission to send messages to this session");
    }

    // メッセージ内容の決定
    let messageText: string;
    if (messageType === "stamp" && stampId) {
      // スタンプの場合は絵文字をテキストとして保存
      const stamp = getStampById(stampId);
      messageText = stamp?.emoji ?? "😊";
    } else {
      // テキストの場合はサニタイズ
      messageText = sanitizeString(content);
    }

    // メッセージを作成
    const messageId = await ctx.db.insert("messages", {
      sessionId,
      senderId: user._id,
      text: messageText,
      createdAt: Date.now(),
      readBy: [user._id], // 送信者は既読
      // Enhancements: スタンプ情報
      type: messageType,
      stampId: messageType === "stamp" ? stampId : undefined,
    });

    // 相手にプッシュ通知を送信
    const recipientId = session.userIdA === user._id ? session.userIdB : session.userIdA;
    const senderProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    const senderName = senderProfile?.displayName || user.handle;

    // 通知本文の決定
    let notificationBody: string;
    if (messageType === "stamp") {
      notificationBody = `${messageText} スタンプを送信しました`;
    } else {
      notificationBody = messageText.length > 50
        ? messageText.substring(0, 50) + "..."
        : messageText;
    }

    // 通知をスケジュール（非同期で実行）
    await ctx.scheduler.runAfter(0, internal.notifications.sendPushNotification, {
      targetUserId: recipientId,
      title: `Message from ${senderName}`,
      body: notificationBody,
      data: { type: "message", sessionId },
    });

    return { messageId };
  },
});

/**
 * 最新の未読メッセージを取得（ローカル通知用）
 */
export const getLatestUnreadMessage = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    // 今日のアクティブなセッションを取得（複合インデックス使用）
    const today = getCurrentDateJST();

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

    // 相手から送られたメッセージを取得（最新順）
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .filter((q) => q.neq(q.field("senderId"), user._id))
      .order("desc")
      .collect();

    // 未読メッセージを取得
    const unreadMessages = messages.filter(
      (msg) => !(msg.readBy || []).includes(user._id)
    );

    if (unreadMessages.length === 0) {
      return null;
    }

    // 最新の未読メッセージ
    const latestMessage = unreadMessages[0];

    // 送信者のプロフィールを取得
    const senderProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", latestMessage.senderId))
      .first();

    // 送信者のユーザー情報を取得（プロフィールがない場合のフォールバック）
    const senderUser = await ctx.db.get(latestMessage.senderId);

    return {
      content: latestMessage.text,
      senderName: senderProfile?.displayName || senderUser?.handle || "Someone",
      createdAt: latestMessage.createdAt,
      unreadCount: unreadMessages.length,
    };
  },
});

/**
 * 今日の話題を取得
 * セッションに割り当てられた話題を返す
 */
export const getTodayTopic = query({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { topic: null };
    }

    // セッションの取得
    const session = await ctx.db.get(sessionId);
    if (!session) {
      return { topic: null };
    }

    // ユーザーがセッションの参加者か確認
    if (session.userIdA !== user._id && session.userIdB !== user._id) {
      return { topic: null };
    }

    // 話題IDが設定されていない場合
    if (!session.topicId) {
      return { topic: null, needsAssignment: true };
    }

    // 話題を取得
    const topic = getTopicById(session.topicId);
    if (!topic) {
      return { topic: null };
    }

    return { topic };
  },
});

/**
 * セッションに話題を割り当てる（既存セッション用）
 */
export const assignTopicToSession = mutation({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    // セッションの取得
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // ユーザーがセッションの参加者か確認
    if (session.userIdA !== user._id && session.userIdB !== user._id) {
      throw new Error("No permission");
    }

    // 既に話題が割り当てられている場合はそのまま返す
    if (session.topicId) {
      const topic = getTopicById(session.topicId);
      return { topic };
    }

    // ランダムに話題を割り当て
    const newTopic = getRandomTopic();
    await ctx.db.patch(sessionId, { topicId: newTopic.id });

    return { topic: newTopic };
  },
});
