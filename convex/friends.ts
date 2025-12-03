import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./auth";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * 友達申請を送信
 */
export const sendRequest = mutation({
  args: {
    addresseeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    if (user._id === args.addresseeId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // 申請先のユーザーが存在するか確認
    const addressee = await ctx.db.get(args.addresseeId);
    if (!addressee) {
      throw new Error("User not found");
    }

    // 既存の関係をチェック（複合インデックス使用）
    const existingFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", user._id).eq("addresseeId", args.addresseeId)
      )
      .first();

    if (existingFriendship) {
      if (existingFriendship.status === "pending") {
        throw new Error("Friend request already sent");
      }
      if (existingFriendship.status === "accepted") {
        throw new Error("Already friends");
      }
      if (existingFriendship.status === "rejected") {
        // 拒否された場合は再申請可能
        await ctx.db.patch(existingFriendship._id, {
          status: "pending",
          updatedAt: Date.now(),
        });
        return existingFriendship._id;
      }
    }

    // 逆方向の申請をチェック（複合インデックス使用）
    const reverseRequest = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", args.addresseeId).eq("addresseeId", user._id)
      )
      .first();

    if (reverseRequest && reverseRequest.status === "pending") {
      // 相手から申請が来ている場合は自動承認
      await ctx.db.patch(reverseRequest._id, {
        status: "accepted",
        updatedAt: Date.now(),
      });
      return reverseRequest._id;
    }

    // 新規友達申請を作成
    const now = Date.now();
    const friendshipId = await ctx.db.insert("friendships", {
      requesterId: user._id,
      addresseeId: args.addresseeId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // 競合状態チェック: 同じペアの重複がないか確認
    const allFriendships = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", user._id).eq("addresseeId", args.addresseeId)
      )
      .collect();

    // 重複が見つかった場合、最も古いものを残して削除
    if (allFriendships.length > 1) {
      const oldestFriendship = allFriendships.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest
      );

      if (oldestFriendship._id !== friendshipId) {
        await ctx.db.delete(friendshipId);
        return oldestFriendship._id;
      }
    }

    // 申請先にプッシュ通知を送信
    const senderProfile = await ctx.db
      .query("profiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    const senderName = senderProfile?.displayName || user.handle;

    await ctx.scheduler.runAfter(0, internal.notifications.sendPushNotification, {
      targetUserId: args.addresseeId,
      title: "Friend Request",
      body: `Friend request from ${senderName}`,
      data: { type: "friend_request", friendshipId },
    });

    return friendshipId;
  },
});

/**
 * 友達申請を承認
 */
export const acceptRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) {
      throw new Error("Friend request not found");
    }

    if (friendship.addresseeId !== user._id) {
      throw new Error("No permission to accept this request");
    }

    if (friendship.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    await ctx.db.patch(args.friendshipId, {
      status: "accepted",
      updatedAt: Date.now(),
    });

    return args.friendshipId;
  },
});

/**
 * 友達申請を拒否
 */
export const rejectRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) {
      throw new Error("Friend request not found");
    }

    if (friendship.addresseeId !== user._id) {
      throw new Error("No permission to reject this request");
    }

    if (friendship.status !== "pending") {
      throw new Error("This request has already been processed");
    }

    await ctx.db.patch(args.friendshipId, {
      status: "rejected",
      updatedAt: Date.now(),
    });

    return args.friendshipId;
  },
});

/**
 * 友達リストを取得
 */
export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    // 自分が申請した友達
    const sentFriendships = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    // 自分が受け取った友達申請
    const receivedFriendships = await ctx.db
      .query("friendships")
      .withIndex("by_addressee", (q) => q.eq("addresseeId", user._id))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    // 友達のユーザーIDを収集
    const friendUserIds = [
      ...sentFriendships.map((f) => f.addresseeId),
      ...receivedFriendships.map((f) => f.requesterId),
    ];

    // 友達のユーザー情報とプロフィールを一括取得（N+1問題の解決）
    const [friendUsers, friendProfiles] = await Promise.all([
      Promise.all(friendUserIds.map(id => ctx.db.get(id))),
      Promise.all(friendUserIds.map(id =>
        ctx.db.query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", id))
          .first()
      ))
    ]);

    // マップを作成してO(1)でアクセス
    const userMap = Object.fromEntries(
      friendUserIds.map((id, i) => [id.toString(), friendUsers[i]])
    );
    const profileMap = Object.fromEntries(
      friendUserIds.map((id, i) => [id.toString(), friendProfiles[i]])
    );

    // 友達情報を構築
    const friends = friendUserIds.map((friendId) => {
      const friendUser = userMap[friendId.toString()];
      const profile = profileMap[friendId.toString()];

      return {
        userId: friendId,
        handle: friendUser?.handle || "",
        displayName: profile?.displayName || "",
        avatarUrl: profile?.avatarUrl || null,
      };
    });

    return friends;
  },
});

/**
 * 受信した友達申請リストを取得
 */
export const listReceivedRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const requests = await ctx.db
      .query("friendships")
      .withIndex("by_addressee", (q) => q.eq("addresseeId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // 申請者の情報を一括取得（N+1問題の解決）
    const requesterIds = requests.map(r => r.requesterId);

    const [requesters, requesterProfiles] = await Promise.all([
      Promise.all(requesterIds.map(id => ctx.db.get(id))),
      Promise.all(requesterIds.map(id =>
        ctx.db.query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", id))
          .first()
      ))
    ]);

    // マップを作成してO(1)でアクセス
    const requesterMap = Object.fromEntries(
      requesterIds.map((id, i) => [id.toString(), requesters[i]])
    );
    const requesterProfileMap = Object.fromEntries(
      requesterIds.map((id, i) => [id.toString(), requesterProfiles[i]])
    );

    // 申請者情報を付加
    const requestsWithUser = requests.map((request) => {
      const requester = requesterMap[request.requesterId.toString()];
      const profile = requesterProfileMap[request.requesterId.toString()];

      return {
        friendshipId: request._id,
        userId: request.requesterId,
        handle: requester?.handle || "",
        displayName: profile?.displayName || "",
        avatarUrl: profile?.avatarUrl || null,
        createdAt: request.createdAt,
      };
    });

    return requestsWithUser.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * 受信した友達申請の数を取得
 */
export const getReceivedRequestsCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return 0;
    }

    const requests = await ctx.db
      .query("friendships")
      .withIndex("by_addressee", (q) => q.eq("addresseeId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return requests.length;
  },
});

/**
 * 送信した友達申請リストを取得
 */
export const listSentRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const requests = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // 申請先の情報を一括取得（N+1問題の解決）
    const addresseeIds = requests.map(r => r.addresseeId);

    const [addressees, addresseeProfiles] = await Promise.all([
      Promise.all(addresseeIds.map(id => ctx.db.get(id))),
      Promise.all(addresseeIds.map(id =>
        ctx.db.query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", id))
          .first()
      ))
    ]);

    // マップを作成してO(1)でアクセス
    const addresseeMap = Object.fromEntries(
      addresseeIds.map((id, i) => [id.toString(), addressees[i]])
    );
    const addresseeProfileMap = Object.fromEntries(
      addresseeIds.map((id, i) => [id.toString(), addresseeProfiles[i]])
    );

    // 申請先情報を付加
    const requestsWithUser = requests.map((request) => {
      const addressee = addresseeMap[request.addresseeId.toString()];
      const profile = addresseeProfileMap[request.addresseeId.toString()];

      return {
        friendshipId: request._id,
        userId: request.addresseeId,
        handle: addressee?.handle || "",
        displayName: profile?.displayName || "",
        avatarUrl: profile?.avatarUrl || null,
        createdAt: request.createdAt,
      };
    });

    return requestsWithUser.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * 友達を削除
 */
export const removeFriend = mutation({
  args: {
    friendUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Authentication required");
    }

    // 双方向の友達関係を検索して削除（複合インデックス使用）
    const sentFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", user._id).eq("addresseeId", args.friendUserId)
      )
      .first();

    const receivedFriendship = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", args.friendUserId).eq("addresseeId", user._id)
      )
      .first();

    if (sentFriendship && sentFriendship.status === "accepted") {
      await ctx.db.delete(sentFriendship._id);
    }

    if (receivedFriendship && receivedFriendship.status === "accepted") {
      await ctx.db.delete(receivedFriendship._id);
    }

    if (!sentFriendship && !receivedFriendship) {
      throw new Error("Friend relationship not found");
    }
  },
});

/**
 * 友達関係を確認
 */
export const checkFriendship = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { status: "none" as const };
    }

    if (user._id === args.userId) {
      return { status: "self" as const };
    }

    // 自分が申請した場合（複合インデックス使用）
    const sentRequest = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", user._id).eq("addresseeId", args.userId)
      )
      .first();

    if (sentRequest) {
      return {
        status: sentRequest.status,
        friendshipId: sentRequest._id,
        direction: "sent" as const,
      };
    }

    // 相手が申請した場合（複合インデックス使用）
    const receivedRequest = await ctx.db
      .query("friendships")
      .withIndex("by_requester_addressee", (q) =>
        q.eq("requesterId", args.userId).eq("addresseeId", user._id)
      )
      .first();

    if (receivedRequest) {
      return {
        status: receivedRequest.status,
        friendshipId: receivedRequest._id,
        direction: "received" as const,
      };
    }

    return { status: "none" as const };
  },
});
