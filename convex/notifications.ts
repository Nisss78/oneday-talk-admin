import { v } from "convex/values";
import { mutation, action, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUser } from "./auth";
import { Id } from "./_generated/dataModel";

/**
 * Push Tokenを保存する
 */
export const savePushToken = mutation({
  args: {
    pushToken: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new Error("Authentication required");
    }

    // 既存のトークンと同じなら更新しない
    if (currentUser.pushToken === args.pushToken) {
      return { success: true, message: "Token already saved" };
    }

    await ctx.db.patch(currentUser._id, {
      pushToken: args.pushToken,
    });

    console.log("Push token saved for user:", currentUser._id);
    return { success: true, message: "Token saved" };
  },
});

/**
 * Push Tokenを削除する（ログアウト時など）
 */
export const removePushToken = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      return { success: false };
    }

    await ctx.db.patch(currentUser._id, {
      pushToken: undefined,
    });

    return { success: true };
  },
});

/**
 * 内部mutation: 指定ユーザーにプッシュ通知を送信するためのトークンを取得
 */
export const getUserPushToken = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.pushToken || null;
  },
});

/**
 * Expo Push APIを呼び出して通知を送信（内部Action）
 * mutationからスケジューラー経由で呼び出される
 */
export const sendPushNotification = internalAction({
  args: {
    targetUserId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // ユーザーのpushTokenを取得
    const user = await ctx.runQuery((internal as any).notifications.getUserForPush, {
      userId: args.targetUserId,
    });

    if (!user?.pushToken) {
      console.log("No push token for user:", args.targetUserId);
      return { success: false, reason: "no_token" };
    }

    const pushToken = user.pushToken;

    // Expo Push Token形式のチェック
    if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
      console.log("Invalid push token format:", pushToken);
      return { success: false, reason: "invalid_token" };
    }

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: pushToken,
          sound: "default",
          title: args.title,
          body: args.body,
          data: args.data || {},
        }),
      });

      const result = await response.json();
      console.log("Push notification result:", result);

      if (result.data?.status === "error") {
        return { success: false, reason: result.data.message };
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to send push notification:", error);
      return { success: false, reason: "api_error" };
    }
  },
});

/**
 * 内部クエリ: ユーザー情報を取得（Action用）
 */
import { internalQuery } from "./_generated/server";

export const getUserForPush = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * メッセージ通知を送信（損失回避型）
 */
export const sendMessageNotification = action({
  args: {
    recipientUserId: v.id("users"),
    senderName: v.string(),
    messagePreview: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction((internal as any).notifications.sendPushNotification, {
      targetUserId: args.recipientUserId,
      title: `返信を見逃していませんか？`,
      body: `${args.senderName}さんからのメッセージ`,
      data: { type: "message" },
    });
  },
});

/**
 * 友達申請通知を送信（損失回避型）
 */
export const sendFriendRequestNotification = action({
  args: {
    recipientUserId: v.id("users"),
    senderName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction((internal as any).notifications.sendPushNotification, {
      targetUserId: args.recipientUserId,
      title: `友達申請が届いています`,
      body: `${args.senderName}さんからの申請`,
      data: { type: "friend_request" },
    });
  },
});

/**
 * マッチング通知を送信（損失回避型）
 */
export const sendMatchNotification = action({
  args: {
    recipientUserId: v.id("users"),
    matchedUserName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction((internal as any).notifications.sendPushNotification, {
      targetUserId: args.recipientUserId,
      title: `今日のマッチを見逃さないで!`,
      body: `${args.matchedUserName}さんとの会話チャンスは今日限り`,
      data: { type: "match" },
    });
  },
});
