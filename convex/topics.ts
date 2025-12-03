/**
 * 話題定数定義
 * 今日の話題表示機能で使用する話題のマスタデータ
 * テキストはクライアント側の翻訳ファイル（locales/*.json）で管理
 */

export interface Topic {
  id: string;
  category: TopicCategory;
}

export type TopicCategory = "daily" | "hobby" | "food" | "work" | "random";

// カテゴリアイコンのマッピング（ラベルはクライアント側で翻訳）
export const TOPIC_CATEGORY_ICONS: Record<TopicCategory, string> = {
  daily: "💬",
  hobby: "🎮",
  food: "🍽️",
  work: "💼",
  random: "🎲",
};

export const TOPICS: Topic[] = [
  // 日常会話（10種類）
  { id: "topic_001", category: "daily" },
  { id: "topic_002", category: "daily" },
  { id: "topic_003", category: "daily" },
  { id: "topic_004", category: "daily" },
  { id: "topic_005", category: "daily" },
  { id: "topic_006", category: "daily" },
  { id: "topic_007", category: "daily" },
  { id: "topic_008", category: "daily" },
  { id: "topic_009", category: "daily" },
  { id: "topic_010", category: "daily" },

  // 趣味・エンタメ（8種類）
  { id: "topic_011", category: "hobby" },
  { id: "topic_012", category: "hobby" },
  { id: "topic_013", category: "hobby" },
  { id: "topic_014", category: "hobby" },
  { id: "topic_015", category: "hobby" },
  { id: "topic_016", category: "hobby" },
  { id: "topic_017", category: "hobby" },
  { id: "topic_018", category: "hobby" },

  // 食べ物（6種類）
  { id: "topic_019", category: "food" },
  { id: "topic_020", category: "food" },
  { id: "topic_021", category: "food" },
  { id: "topic_022", category: "food" },
  { id: "topic_023", category: "food" },
  { id: "topic_024", category: "food" },

  // 仕事・学び（3種類）
  { id: "topic_025", category: "work" },
  { id: "topic_026", category: "work" },
  { id: "topic_027", category: "work" },

  // ランダム・ユニーク（3種類）
  { id: "topic_028", category: "random" },
  { id: "topic_029", category: "random" },
  { id: "topic_030", category: "random" },
];

/**
 * ランダムに話題を取得
 */
export function getRandomTopic(): Topic {
  const randomIndex = Math.floor(Math.random() * TOPICS.length);
  return TOPICS[randomIndex];
}

/**
 * IDで話題を取得
 */
export function getTopicById(id: string): Topic | undefined {
  return TOPICS.find((topic) => topic.id === id);
}

/**
 * カテゴリ別に話題を取得
 */
export function getTopicsByCategory(category: TopicCategory): Topic[] {
  return TOPICS.filter((topic) => topic.category === category);
}

/**
 * 話題IDが有効かどうかを検証
 */
export function isValidTopicId(id: string): boolean {
  return TOPICS.some((topic) => topic.id === id);
}
