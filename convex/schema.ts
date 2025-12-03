import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    handle: v.string(),
    createdAt: v.number(),
    pushToken: v.optional(v.string()), // Expo Push Token
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_handle", ["handle"]),

  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    avatarUrl: v.union(v.string(), v.null()),
    photoStories: v.optional(v.array(
      v.object({
        imageUrl: v.string(),
        caption: v.string(),
      })
    )),
    bio: v.union(v.string(), v.null()),
    tags: v.array(v.string()),
    topics: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
      })
    ),
    instagramUrl: v.optional(v.union(v.string(), v.null())),
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),

  friendships: defineTable({
    requesterId: v.id("users"),
    addresseeId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_requester", ["requesterId"])
    .index("by_addressee", ["addresseeId"])
    .index("by_status", ["status"])
    .index("by_requester_addressee", ["requesterId", "addresseeId"]),

  dailySessions: defineTable({
    dateJst: v.string(),
    userIdA: v.id("users"),
    userIdB: v.id("users"),
    state: v.union(v.literal("active"), v.literal("expired")),
    createdAt: v.number(),
    // 既存データとの互換性のため
    matchType: v.optional(v.string()),
    // Enhancements: 今日の話題
    topicId: v.optional(v.string()),
    // Community: コミュニティマッチング用
    communityId: v.optional(v.id("communities")),
  })
    .index("by_date", ["dateJst"])
    .index("by_user_a", ["userIdA"])
    .index("by_user_b", ["userIdB"])
    .index("by_state", ["state"])
    .index("by_date_user_a", ["dateJst", "userIdA"])
    .index("by_date_user_b", ["dateJst", "userIdB"])
    .index("by_date_user_match_type", ["dateJst", "userIdA", "matchType"])
    .index("by_date_match_type", ["dateJst", "matchType"]),

  messages: defineTable({
    sessionId: v.id("dailySessions"),
    senderId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
    readBy: v.optional(v.array(v.id("users"))), // 既読したユーザーのリスト
    // Enhancements: スタンプ対応
    type: v.optional(v.union(v.literal("text"), v.literal("stamp"), v.literal("game_invite"), v.literal("game_result"))),
    stampId: v.optional(v.string()),
    // ゲーム招待用
    gameType: v.optional(v.string()), // "mbti_compatibility"
    gameId: v.optional(v.id("chatGames")),
    senderMbti: v.optional(v.string()), // 送信者のMBTIタイプ
    // ゲーム結果用（システムメッセージ）
    gameResult: v.optional(v.object({
      userAMbti: v.string(),
      userBMbti: v.string(),
      compatibilityScore: v.number(),
      description: v.string(),
    })),
  })
    .index("by_session", ["sessionId"])
    .index("by_created_at", ["createdAt"])
    .index("by_type", ["type"]),

  handleHistory: defineTable({
    userId: v.id("users"),
    oldHandle: v.string(),
    newHandle: v.string(),
    changedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_changed_at", ["changedAt"]),

// ゲーム機能: MBTI診断
  chatGames: defineTable({
    sessionId: v.id("dailySessions"),
    gameType: v.literal("mbti_compatibility"), // 将来の拡張用
    userAMbti: v.optional(v.string()), // "INTJ", "ENFP" など16タイプ
    userBMbti: v.optional(v.string()),
    status: v.union(
      v.literal("waiting"), // 両者の入力待ち
      v.literal("completed") // 診断完了
    ),
    result: v.optional(v.object({
      compatibilityScore: v.number(), // 0-100
      description: v.string(), // 相性解説
    })),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_type", ["sessionId", "gameType"]),

  // ========== Community Features ==========
  communities: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    creatorId: v.id("users"),
    adminIds: v.array(v.id("users")),
    isActive: v.boolean(),
    inviteCode: v.string(),
    inviteCodeEnabled: v.optional(v.boolean()), // 招待コードが有効かどうか（デフォルト: true）
    inviteCodeExpiresAt: v.optional(v.number()), // 招待コードの有効期限（ミリ秒）
    inviteCodeUsageLimit: v.optional(v.number()), // 招待コードの使用回数制限
    inviteCodeUsageCount: v.optional(v.number()), // 招待コードの現在の使用回数
    inviteOnly: v.optional(v.boolean()),
    maxMembers: v.optional(v.number()),
    // 公式コミュニティ機能
    isOfficial: v.optional(v.boolean()), // 公式コミュニティフラグ
    requiredEmailDomains: v.optional(v.array(v.string())), // 許可ドメイン例: ["doshisha.ac.jp"]
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creator", ["creatorId"])
    .index("by_invite_code", ["inviteCode"])
    .index("by_is_active", ["isActive"]),

  communityMemberships: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("left"), v.literal("invited")),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("users")),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_community_user", ["communityId", "userId"])
    .index("by_community_status", ["communityId", "status"]),

  communityInvites: defineTable({
    communityId: v.id("communities"),
    inviterUserId: v.id("users"),
    inviteeUserId: v.id("users"),
    inviteCode: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected"), v.literal("expired")),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_community", ["communityId"])
    .index("by_invitee", ["inviteeUserId"])
    .index("by_inviter", ["inviterUserId"])
    .index("by_community_invitee", ["communityId", "inviteeUserId"])
    .index("by_status", ["status"]),

  // パスワード（inviteCode）による参加リクエスト
  communityJoinRequests: defineTable({
    communityId: v.id("communities"),
    userId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
    respondedBy: v.optional(v.id("users")),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_community_status", ["communityId", "status"])
    .index("by_community_user", ["communityId", "userId"]),

  // コミュニティイベント
  communityEvents: defineTable({
    communityId: v.id("communities"),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.number(), // イベント開催日時（ミリ秒）
    eventEndDate: v.optional(v.number()), // イベント終了日時（オプション）
    location: v.optional(v.string()), // 開催場所
    externalUrl: v.optional(v.string()), // 外部リンク（詳細ページや申込ページ）
    isPublished: v.boolean(), // 公開状態
    createdBy: v.id("users"), // 作成者（運営）
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_date", ["communityId", "eventDate"])
    .index("by_community_published", ["communityId", "isPublished"]),

  // コミュニティメディア（広告・有益情報）
  communityMedia: defineTable({
    communityId: v.id("communities"),
    title: v.string(),
    content: v.optional(v.string()), // テキスト内容
    imageUrl: v.optional(v.string()), // 画像URL
    externalUrl: v.optional(v.string()), // 外部リンク
    mediaType: v.union(v.literal("ad"), v.literal("info"), v.literal("announcement")), // 種類
    priority: v.optional(v.number()), // 表示優先度（高いほど上に表示）
    isPublished: v.boolean(), // 公開状態
    publishedAt: v.optional(v.number()), // 公開日時
    expiresAt: v.optional(v.number()), // 有効期限（オプション）
    createdBy: v.id("users"), // 作成者（運営）
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_type", ["communityId", "mediaType"])
    .index("by_community_published", ["communityId", "isPublished"])
    .index("by_community_priority", ["communityId", "priority"]),

  // 管理者（グローバル管理者 - コミュニティ管理者とは別）
  admins: defineTable({
    userId: v.id("users"),
    email: v.string(), // 管理者のメールアドレス（照合用）
    role: v.union(v.literal("super_admin"), v.literal("admin")), // super_adminは全権限、adminは限定権限
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")), // 誰が追加したか
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  // メール認証（公式コミュニティ用）
  emailVerifications: defineTable({
    userId: v.id("users"),
    communityId: v.optional(v.id("communities")),
    email: v.string(),
    domain: v.string(), // メールドメイン（例: "doshisha.ac.jp"）
    tokenHash: v.string(), // SHA-256ハッシュ化されたトークン
    purpose: v.union(v.literal("community_join"), v.literal("account_link")),
    status: v.union(v.literal("pending"), v.literal("verified"), v.literal("expired")),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_community", ["userId", "communityId"])
    .index("by_email", ["email"])
    .index("by_expires", ["expiresAt"])
    .index("by_user_status", ["userId", "status"]),
});

