import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// MBTI 16タイプ
const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

// MBTI相性マトリックス（0-100）
const COMPATIBILITY_MATRIX: Record<string, Record<string, number>> = {
  // 各タイプ間の相性スコア
  INTJ: { INTJ: 75, INTP: 85, ENTJ: 90, ENTP: 95, INFJ: 80, INFP: 70, ENFJ: 75, ENFP: 85, ISTJ: 65, ISFJ: 55, ESTJ: 60, ESFJ: 50, ISTP: 70, ISFP: 60, ESTP: 65, ESFP: 55 },
  INTP: { INTJ: 85, INTP: 75, ENTJ: 85, ENTP: 90, INFJ: 75, INFP: 80, ENFJ: 70, ENFP: 85, ISTJ: 60, ISFJ: 50, ESTJ: 55, ESFJ: 45, ISTP: 80, ISFP: 65, ESTP: 75, ESFP: 60 },
  ENTJ: { INTJ: 90, INTP: 85, ENTJ: 80, ENTP: 85, INFJ: 85, INFP: 75, ENFJ: 80, ENFP: 80, ISTJ: 75, ISFJ: 65, ESTJ: 85, ESFJ: 70, ISTP: 75, ISFP: 65, ESTP: 80, ESFP: 70 },
  ENTP: { INTJ: 95, INTP: 90, ENTJ: 85, ENTP: 80, INFJ: 90, INFP: 85, ENFJ: 85, ENFP: 85, ISTJ: 60, ISFJ: 55, ESTJ: 65, ESFJ: 60, ISTP: 85, ISFP: 70, ESTP: 85, ESFP: 75 },
  INFJ: { INTJ: 80, INTP: 75, ENTJ: 85, ENTP: 90, INFJ: 80, INFP: 85, ENFJ: 85, ENFP: 95, ISTJ: 60, ISFJ: 70, ESTJ: 55, ESFJ: 65, ISTP: 65, ISFP: 75, ESTP: 60, ESFP: 70 },
  INFP: { INTJ: 70, INTP: 80, ENTJ: 75, ENTP: 85, INFJ: 85, INFP: 80, ENFJ: 90, ENFP: 90, ISTJ: 55, ISFJ: 65, ESTJ: 50, ESFJ: 60, ISTP: 60, ISFP: 80, ESTP: 55, ESFP: 75 },
  ENFJ: { INTJ: 75, INTP: 70, ENTJ: 80, ENTP: 85, INFJ: 85, INFP: 90, ENFJ: 80, ENFP: 85, ISTJ: 65, ISFJ: 80, ESTJ: 70, ESFJ: 85, ISTP: 60, ISFP: 85, ESTP: 70, ESFP: 90 },
  ENFP: { INTJ: 85, INTP: 85, ENTJ: 80, ENTP: 85, INFJ: 95, INFP: 90, ENFJ: 85, ENFP: 80, ISTJ: 55, ISFJ: 65, ESTJ: 60, ESFJ: 70, ISTP: 70, ISFP: 85, ESTP: 75, ESFP: 85 },
  ISTJ: { INTJ: 65, INTP: 60, ENTJ: 75, ENTP: 60, INFJ: 60, INFP: 55, ENFJ: 65, ENFP: 55, ISTJ: 80, ISFJ: 85, ESTJ: 90, ESFJ: 85, ISTP: 85, ISFP: 80, ESTP: 80, ESFP: 75 },
  ISFJ: { INTJ: 55, INTP: 50, ENTJ: 65, ENTP: 55, INFJ: 70, INFP: 65, ENFJ: 80, ENFP: 65, ISTJ: 85, ISFJ: 80, ESTJ: 85, ESFJ: 90, ISTP: 75, ISFP: 85, ESTP: 70, ESFP: 85 },
  ESTJ: { INTJ: 60, INTP: 55, ENTJ: 85, ENTP: 65, INFJ: 55, INFP: 50, ENFJ: 70, ENFP: 60, ISTJ: 90, ISFJ: 85, ESTJ: 80, ESFJ: 85, ISTP: 85, ISFP: 75, ESTP: 90, ESFP: 80 },
  ESFJ: { INTJ: 50, INTP: 45, ENTJ: 70, ENTP: 60, INFJ: 65, INFP: 60, ENFJ: 85, ENFP: 70, ISTJ: 85, ISFJ: 90, ESTJ: 85, ESFJ: 80, ISTP: 70, ISFP: 85, ESTP: 80, ESFP: 90 },
  ISTP: { INTJ: 70, INTP: 80, ENTJ: 75, ENTP: 85, INFJ: 65, INFP: 60, ENFJ: 60, ENFP: 70, ISTJ: 85, ISFJ: 75, ESTJ: 85, ESFJ: 70, ISTP: 80, ISFP: 85, ESTP: 90, ESFP: 85 },
  ISFP: { INTJ: 60, INTP: 65, ENTJ: 65, ENTP: 70, INFJ: 75, INFP: 80, ENFJ: 85, ENFP: 85, ISTJ: 80, ISFJ: 85, ESTJ: 75, ESFJ: 85, ISTP: 85, ISFP: 80, ESTP: 85, ESFP: 90 },
  ESTP: { INTJ: 65, INTP: 75, ENTJ: 80, ENTP: 85, INFJ: 60, INFP: 55, ENFJ: 70, ENFP: 75, ISTJ: 80, ISFJ: 70, ESTJ: 90, ESFJ: 80, ISTP: 90, ISFP: 85, ESTP: 80, ESFP: 90 },
  ESFP: { INTJ: 55, INTP: 60, ENTJ: 70, ENTP: 75, INFJ: 70, INFP: 75, ENFJ: 90, ENFP: 85, ISTJ: 75, ISFJ: 85, ESTJ: 80, ESFJ: 90, ISTP: 85, ISFP: 90, ESTP: 90, ESFP: 80 },
};

// 相性解説を生成
function getCompatibilityDescription(typeA: string, typeB: string, score: number): string {
  // 同じタイプの場合
  if (typeA === typeB) {
    return `同じ${typeA}タイプ同士！考え方や価値観がとても似ているので、お互いを理解しやすい関係です。ただし、似すぎているからこそ、お互いの盲点に気づきにくいこともあるかもしれません。`;
  }

  // 相性スコアに応じた解説
  if (score >= 90) {
    return `${typeA}と${typeB}は最高の相性！お互いの強みを活かし合い、弱みを補い合える理想的なパートナーシップが築けます。会話も弾み、一緒にいて心地よい関係になりやすいです。`;
  } else if (score >= 80) {
    return `${typeA}と${typeB}はとても良い相性です。異なる視点を持ちながらも、お互いを尊重し合える関係が築けます。刺激的で成長できる組み合わせです。`;
  } else if (score >= 70) {
    return `${typeA}と${typeB}は良好な相性。お互いの違いを理解し受け入れることで、バランスの取れた関係が築けます。コミュニケーションを大切にすると◎`;
  } else if (score >= 60) {
    return `${typeA}と${typeB}はまずまずの相性。価値観の違いはありますが、それぞれの強みを活かすことで良い関係が築けます。お互いの考え方を理解する努力が大切です。`;
  } else {
    return `${typeA}と${typeB}は、異なる価値観を持つ組み合わせ。だからこそ、お互いから学べることがたくさんあります。違いを楽しむ気持ちを持つと、ユニークな関係が築けるかも！`;
  }
}

// MBTI相性ゲームを開始
export const startMbtiGame = mutation({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("認証が必要です");

    // 既存のゲームがあるか確認
    const existingGame = await ctx.db
      .query("chatGames")
      .withIndex("by_session_type", (q) =>
        q.eq("sessionId", args.sessionId).eq("gameType", "mbti_compatibility")
      )
      .first();

    if (existingGame) {
      // 完了済みの場合は削除して新規作成できるようにする
      if (existingGame.status === "completed") {
        await ctx.db.delete(existingGame._id);
      } else {
        return existingGame._id;
      }
    }

    // 新しいゲームを作成
    const gameId = await ctx.db.insert("chatGames", {
      sessionId: args.sessionId,
      gameType: "mbti_compatibility",
      status: "waiting",
      createdAt: Date.now(),
    });

    return gameId;
  },
});

// MBTIを送信
export const submitMbti = mutation({
  args: {
    sessionId: v.id("dailySessions"),
    mbtiType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("認証が必要です");

    // MBTIタイプのバリデーション
    if (!MBTI_TYPES.includes(args.mbtiType as any)) {
      throw new Error("無効なMBTIタイプです");
    }

    // ユーザーを取得
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("ユーザーが見つかりません");

    // セッションを取得
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("セッションが見つかりません");

    // どちらのユーザーか判定
    const isUserA = session.userIdA === user._id;
    const isUserB = session.userIdB === user._id;
    if (!isUserA && !isUserB) throw new Error("このセッションに参加していません");

    // ゲームを取得または作成
    let game = await ctx.db
      .query("chatGames")
      .withIndex("by_session_type", (q) =>
        q.eq("sessionId", args.sessionId).eq("gameType", "mbti_compatibility")
      )
      .first();

    // 完了済みのゲームがあれば削除して新規作成
    if (game && game.status === "completed") {
      await ctx.db.delete(game._id);
      game = null;
    }

    // 既存のMBTI値を保存（メッセージ送信判定用）
    const previousUserAMbti = game?.userAMbti;
    const previousUserBMbti = game?.userBMbti;
    const hadPreviousSubmission = isUserA ? !!previousUserAMbti : !!previousUserBMbti;

    if (!game) {
      // ゲームがなければ作成
      const gameId = await ctx.db.insert("chatGames", {
        sessionId: args.sessionId,
        gameType: "mbti_compatibility",
        status: "waiting",
        createdAt: Date.now(),
      });
      game = await ctx.db.get(gameId);
    }

    if (!game) throw new Error("ゲームの作成に失敗しました");

    // MBTIを保存
    const updateData: any = {};
    if (isUserA) {
      updateData.userAMbti = args.mbtiType;
    } else {
      updateData.userBMbti = args.mbtiType;
    }

    await ctx.db.patch(game._id, updateData);

    // 初回送信の場合のみ、チャットメッセージとして招待を送信
    if (!hadPreviousSubmission) {
      await ctx.db.insert("messages", {
        sessionId: args.sessionId,
        senderId: user._id,
        text: `🧠 MBTI相性診断に参加しました！（${args.mbtiType}）`,
        createdAt: Date.now(),
        readBy: [user._id],
        type: "game_invite",
        gameType: "mbti_compatibility",
        gameId: game._id,
        senderMbti: args.mbtiType,
      });
    }

    // 両者が入力済みか確認
    const updatedGame = await ctx.db.get(game._id);
    if (!updatedGame) throw new Error("ゲームが見つかりません");

    const userAMbti = isUserA ? args.mbtiType : updatedGame.userAMbti;
    const userBMbti = isUserB ? args.mbtiType : updatedGame.userBMbti;

    if (userAMbti && userBMbti) {
      // 両者入力完了 → 診断結果を計算
      const score = COMPATIBILITY_MATRIX[userAMbti]?.[userBMbti] ?? 70;
      const description = getCompatibilityDescription(userAMbti, userBMbti, score);

      await ctx.db.patch(game._id, {
        status: "completed",
        result: {
          compatibilityScore: score,
          description,
        },
        completedAt: Date.now(),
      });

      // 診断結果をシステムメッセージとしてチャットに送信
      await ctx.db.insert("messages", {
        sessionId: args.sessionId,
        senderId: user._id, // システムメッセージだが送信者は必要
        text: `🧠 MBTI相性診断の結果が出ました！`,
        createdAt: Date.now(),
        readBy: [],
        type: "game_result",
        gameType: "mbti_compatibility",
        gameId: game._id,
        gameResult: {
          userAMbti,
          userBMbti,
          compatibilityScore: score,
          description,
        },
      });
    }

    return { success: true, gameId: game._id };
  },
});

// ゲーム状態を取得
export const getMbtiGame = query({
  args: {
    sessionId: v.id("dailySessions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // ユーザーを取得
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return null;

    // セッションを取得
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // どちらのユーザーか判定
    const isUserA = session.userIdA === user._id;
    const isUserB = session.userIdB === user._id;
    if (!isUserA && !isUserB) return null;

    // ゲームを取得
    const game = await ctx.db
      .query("chatGames")
      .withIndex("by_session_type", (q) =>
        q.eq("sessionId", args.sessionId).eq("gameType", "mbti_compatibility")
      )
      .first();

    if (!game) return null;

    // 自分と相手のMBTIを返す
    return {
      gameId: game._id,
      status: game.status,
      myMbti: isUserA ? game.userAMbti : game.userBMbti,
      partnerMbti: isUserA ? game.userBMbti : game.userAMbti,
      hasPartnerSubmitted: isUserA ? !!game.userBMbti : !!game.userAMbti,
      result: game.result,
    };
  },
});
