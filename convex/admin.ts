import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 管理者かどうかを確認
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { isAdmin: false, role: null };
    }

    const email = identity.email;
    if (!email) {
      return { isAdmin: false, role: null };
    }

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!admin) {
      return { isAdmin: false, role: null };
    }

    return { isAdmin: true, role: admin.role };
  },
});

// 管理者を追加（super_admin のみ）
export const addAdmin = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("super_admin"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("認証が必要です");
    }

    // 呼び出し元がsuper_adminかチェック
    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin || callerAdmin.role !== "super_admin") {
      throw new Error("super_admin権限が必要です");
    }

    // 既存の管理者チェック
    const existingAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingAdmin) {
      throw new Error("この管理者は既に登録されています");
    }

    // ユーザーを検索（メールアドレスから）
    // Note: Clerkのメールアドレスと一致するユーザーを後で紐付け可能
    const adminId = await ctx.db.insert("admins", {
      userId: callerAdmin.userId, // 一時的に呼び出し元のuserIdを使用
      email: args.email,
      role: args.role,
      createdAt: Date.now(),
      createdBy: callerAdmin.userId,
    });

    return adminId;
  },
});

// 管理者を削除（super_admin のみ）
export const removeAdmin = mutation({
  args: {
    adminId: v.id("admins"),
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

    if (!callerAdmin || callerAdmin.role !== "super_admin") {
      throw new Error("super_admin権限が必要です");
    }

    const targetAdmin = await ctx.db.get(args.adminId);
    if (!targetAdmin) {
      throw new Error("管理者が見つかりません");
    }

    // 自分自身は削除できない
    if (targetAdmin.email === identity.email) {
      throw new Error("自分自身を削除することはできません");
    }

    await ctx.db.delete(args.adminId);
    return { success: true };
  },
});

// 管理者一覧を取得
export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      return [];
    }

    const callerAdmin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!callerAdmin) {
      return [];
    }

    const admins = await ctx.db.query("admins").collect();
    return admins;
  },
});

// ダッシュボード統計情報
export const getDashboardStats = query({
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

    // ユーザー数
    const users = await ctx.db.query("users").collect();
    const totalUsers = users.length;

    // コミュニティ数
    const communities = await ctx.db.query("communities").collect();
    const totalCommunities = communities.length;
    const officialCommunities = communities.filter((c) => c.isOfficial).length;

    // アクティブセッション数（今日）
    const today = new Date();
    const todayJst = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const activeSessions = await ctx.db
      .query("dailySessions")
      .withIndex("by_date", (q) => q.eq("dateJst", todayJst))
      .collect();

    // メッセージ数（今日）
    const todayStart = new Date(today.setHours(0, 0, 0, 0)).getTime();
    const messages = await ctx.db.query("messages").collect();
    const todayMessages = messages.filter((m) => m.createdAt >= todayStart).length;

    // イベント数
    const events = await ctx.db.query("communityEvents").collect();
    const upcomingEvents = events.filter((e) => e.eventDate > Date.now()).length;

    // メディア数
    const media = await ctx.db.query("communityMedia").collect();
    const publishedMedia = media.filter((m) => m.isPublished).length;

    return {
      totalUsers,
      totalCommunities,
      officialCommunities,
      todaySessions: activeSessions.length,
      todayMessages,
      upcomingEvents,
      publishedMedia,
    };
  },
});

// 公式コミュニティ一覧
export const listOfficialCommunities = query({
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
    const officialCommunities = communities.filter((c) => c.isOfficial);

    // 各コミュニティのメンバー数を取得
    const communitiesWithStats = await Promise.all(
      officialCommunities.map(async (community) => {
        const memberships = await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_status", (q) =>
            q.eq("communityId", community._id).eq("status", "active")
          )
          .collect();

        return {
          ...community,
          memberCount: memberships.length,
        };
      })
    );

    return communitiesWithStats;
  },
});

// ユーザー一覧（ページネーション付き）
export const listUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
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

    const limit = args.limit || 50;
    const users = await ctx.db.query("users").take(limit);

    // 各ユーザーのプロファイルを取得（avatarUrlをストレージURLに変換）
    const usersWithProfiles = await Promise.all(
      users.map(async (user) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .first();

        // avatarUrlがストレージIDの場合、実際のURLに変換
        let avatarUrl: string | null = null;
        if (profile?.avatarUrl) {
          try {
            // ストレージIDからURLを取得
            const url = await ctx.storage.getUrl(profile.avatarUrl as any);
            avatarUrl = url;
          } catch {
            // 変換に失敗した場合は元の値を使用（外部URLの可能性）
            avatarUrl = profile.avatarUrl;
          }
        }

        return {
          ...user,
          profile: profile ? {
            ...profile,
            avatarUrl,
          } : null,
        };
      })
    );

    return usersWithProfiles;
  },
});

// 公式コミュニティを作成
export const createOfficialCommunity = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    requiredEmailDomains: v.array(v.string()),
    maxMembers: v.optional(v.number()),
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

    // 招待コードを生成
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const communityId = await ctx.db.insert("communities", {
      name: args.name,
      description: args.description,
      iconUrl: args.iconUrl,
      creatorId: callerAdmin.userId,
      adminIds: [callerAdmin.userId],
      isActive: true,
      inviteCode,
      inviteCodeEnabled: false, // 公式コミュニティは招待コード不要
      isOfficial: true,
      requiredEmailDomains: args.requiredEmailDomains,
      maxMembers: args.maxMembers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return communityId;
  },
});

// 公式コミュニティを更新
export const updateOfficialCommunity = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    requiredEmailDomains: v.optional(v.array(v.string())),
    maxMembers: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
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

    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("コミュニティが見つかりません");
    }

    if (!community.isOfficial) {
      throw new Error("公式コミュニティのみ編集できます");
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.iconUrl !== undefined) updates.iconUrl = args.iconUrl;
    if (args.requiredEmailDomains !== undefined) updates.requiredEmailDomains = args.requiredEmailDomains;
    if (args.maxMembers !== undefined) updates.maxMembers = args.maxMembers;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.communityId, updates);
    return { success: true };
  },
});

// ========== イベント管理（管理者用） ==========

// イベント一覧を取得（公式コミュニティ別）
export const listEventsForAdmin = query({
  args: {
    communityId: v.optional(v.id("communities")),
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

    let events;
    if (args.communityId) {
      events = await ctx.db
        .query("communityEvents")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId!))
        .collect();
    } else {
      events = await ctx.db.query("communityEvents").collect();
    }

    // コミュニティ情報を付与
    const eventsWithCommunity = await Promise.all(
      events.map(async (event) => {
        const community = await ctx.db.get(event.communityId);
        return {
          ...event,
          communityName: community?.name || "不明",
        };
      })
    );

    // 日付順にソート（新しい順）
    eventsWithCommunity.sort((a, b) => b.eventDate - a.eventDate);

    return eventsWithCommunity;
  },
});

// イベントを作成（管理者用）
export const createEventForAdmin = mutation({
  args: {
    communityId: v.id("communities"),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.number(),
    eventEndDate: v.optional(v.number()),
    location: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
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

    const community = await ctx.db.get(args.communityId);
    if (!community || !community.isOfficial) {
      throw new Error("公式コミュニティが見つかりません");
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("communityEvents", {
      communityId: args.communityId,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      location: args.location,
      externalUrl: args.externalUrl,
      isPublished: args.isPublished ?? false,
      createdBy: callerAdmin.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { eventId };
  },
});

// イベントを更新（管理者用）
export const updateEventForAdmin = mutation({
  args: {
    eventId: v.id("communityEvents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventEndDate: v.optional(v.number()),
    location: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
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

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("イベントが見つかりません");
    }

    const { eventId, ...updateFields } = args;
    await ctx.db.patch(args.eventId, {
      ...updateFields,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// イベントを削除（管理者用）
export const deleteEventForAdmin = mutation({
  args: {
    eventId: v.id("communityEvents"),
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

    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("イベントが見つかりません");
    }

    await ctx.db.delete(args.eventId);
    return { success: true };
  },
});

// ========== メディア管理（管理者用） ==========

// メディア一覧を取得
export const listMediaForAdmin = query({
  args: {
    communityId: v.optional(v.id("communities")),
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

    let media;
    if (args.communityId) {
      media = await ctx.db
        .query("communityMedia")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId!))
        .collect();
    } else {
      media = await ctx.db.query("communityMedia").collect();
    }

    // コミュニティ情報を付与
    const mediaWithCommunity = await Promise.all(
      media.map(async (item) => {
        const community = await ctx.db.get(item.communityId);
        return {
          ...item,
          communityName: community?.name || "不明",
        };
      })
    );

    // 作成日順にソート（新しい順）
    mediaWithCommunity.sort((a, b) => b.createdAt - a.createdAt);

    return mediaWithCommunity;
  },
});

// メディアを作成（管理者用）
export const createMediaForAdmin = mutation({
  args: {
    communityId: v.id("communities"),
    title: v.string(),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    mediaType: v.union(v.literal("ad"), v.literal("info"), v.literal("announcement")),
    priority: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
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

    const community = await ctx.db.get(args.communityId);
    if (!community || !community.isOfficial) {
      throw new Error("公式コミュニティが見つかりません");
    }

    const now = Date.now();
    const mediaId = await ctx.db.insert("communityMedia", {
      communityId: args.communityId,
      title: args.title,
      content: args.content,
      imageUrl: args.imageUrl,
      externalUrl: args.externalUrl,
      mediaType: args.mediaType,
      priority: args.priority ?? 0,
      isPublished: args.isPublished ?? false,
      publishedAt: args.isPublished ? now : undefined,
      createdBy: callerAdmin.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { mediaId };
  },
});

// メディアを更新（管理者用）
export const updateMediaForAdmin = mutation({
  args: {
    mediaId: v.id("communityMedia"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    mediaType: v.optional(v.union(v.literal("ad"), v.literal("info"), v.literal("announcement"))),
    priority: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
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

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    const { mediaId, ...updateFields } = args;
    const updates: Record<string, unknown> = {
      ...updateFields,
      updatedAt: Date.now(),
    };

    // 公開に変更された場合は公開日時を設定
    if (args.isPublished && !media.isPublished) {
      updates.publishedAt = Date.now();
    }

    await ctx.db.patch(args.mediaId, updates);
    return { success: true };
  },
});

// メディアを削除（管理者用）
export const deleteMediaForAdmin = mutation({
  args: {
    mediaId: v.id("communityMedia"),
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

    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("メディアが見つかりません");
    }

    await ctx.db.delete(args.mediaId);
    return { success: true };
  },
});

// 初期管理者を設定（環境変数から）
export const initializeSuperAdmin = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // 既存の管理者がいないことを確認
    const existingAdmins = await ctx.db.query("admins").collect();
    if (existingAdmins.length > 0) {
      throw new Error("管理者は既に設定されています");
    }

    // ユーザーを作成または取得（ダミーのuserIdを使用）
    // 実際のユーザーがログインした時に紐付けを更新する
    const users = await ctx.db.query("users").take(1);
    const dummyUserId = users[0]?._id;

    if (!dummyUserId) {
      throw new Error("ユーザーが存在しません。先にアプリでユーザーを作成してください。");
    }

    await ctx.db.insert("admins", {
      userId: dummyUserId,
      email: args.email,
      role: "super_admin",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ========== イベント申請管理 ==========

/**
 * イベント申請一覧を取得（管理者用）
 */
export const listEventRequests = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    communityId: v.optional(v.id("communities")),
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

    // 公式コミュニティのIDリストを取得
    const officialCommunities = await ctx.db
      .query("communities")
      .filter((q) => q.eq(q.field("isOfficial"), true))
      .collect();
    const officialCommunityIds = officialCommunities.map((c) => c._id);

    let requests;
    if (args.communityId) {
      // 特定のコミュニティの申請のみ
      if (args.status) {
        requests = await ctx.db
          .query("communityEventRequests")
          .withIndex("by_community_status", (q) =>
            q.eq("communityId", args.communityId!).eq("status", args.status!)
          )
          .collect();
      } else {
        requests = await ctx.db
          .query("communityEventRequests")
          .withIndex("by_community", (q) => q.eq("communityId", args.communityId!))
          .collect();
      }
    } else {
      // 全公式コミュニティの申請
      if (args.status) {
        requests = await ctx.db
          .query("communityEventRequests")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect();
      } else {
        requests = await ctx.db.query("communityEventRequests").collect();
      }
      // 公式コミュニティのみフィルタ
      requests = requests.filter((r) => officialCommunityIds.includes(r.communityId));
    }

    // 申請者情報とコミュニティ情報を付与
    const requestsWithDetails = await Promise.all(
      requests.map(async (request) => {
        const requester = await ctx.db.get(request.requesterId);
        const profile = requester
          ? await ctx.db
              .query("profiles")
              .withIndex("by_user_id", (q) => q.eq("userId", requester._id))
              .first()
          : null;
        const community = await ctx.db.get(request.communityId);

        return {
          ...request,
          requester: requester
            ? {
                _id: requester._id,
                handle: requester.handle,
                displayName: profile?.displayName ?? requester.handle,
                avatarUrl: profile?.avatarUrl,
              }
            : null,
          communityName: community?.name || "不明",
        };
      })
    );

    // 新しい順にソート
    requestsWithDetails.sort((a, b) => b.createdAt - a.createdAt);

    return requestsWithDetails;
  },
});

/**
 * イベント申請を承認（管理者用）
 */
export const approveEventRequest = mutation({
  args: {
    requestId: v.id("communityEventRequests"),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    if (request.status !== "pending") {
      throw new Error("審査待ちの申請のみ承認できます");
    }

    const now = Date.now();

    // 申請を承認状態に更新
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: callerAdmin.userId,
      reviewedAt: now,
      updatedAt: now,
    });

    // communityEventsに新規イベントとして登録（公開状態で）
    const eventId = await ctx.db.insert("communityEvents", {
      communityId: request.communityId,
      title: request.title,
      description: request.description,
      imageUrl: request.imageUrl,
      eventDate: request.eventDate,
      eventEndDate: request.eventEndDate,
      location: request.location,
      externalUrl: request.externalUrl,
      isPublished: true, // 承認されたら自動で公開
      createdBy: request.requesterId, // 元の申請者をcreatedByに
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, eventId };
  },
});

/**
 * イベント申請を却下（管理者用）
 */
export const rejectEventRequest = mutation({
  args: {
    requestId: v.id("communityEventRequests"),
    rejectionReason: v.optional(v.string()),
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

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("申請が見つかりません");
    }

    if (request.status !== "pending") {
      throw new Error("審査待ちの申請のみ却下できます");
    }

    const now = Date.now();

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      rejectionReason: args.rejectionReason,
      reviewedBy: callerAdmin.userId,
      reviewedAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});
