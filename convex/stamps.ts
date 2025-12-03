/**
 * スタンプ定数定義
 * スタンプ送信機能で使用する絵文字スタンプのマスタデータ
 */

export interface Stamp {
  id: string;
  emoji: string;
  label: string;
  category: StampCategory;
}

export type StampCategory = "face" | "gesture" | "symbol";

export interface StampCategoryInfo {
  id: StampCategory | "recent";
  icon: string; // Ionicons name
}

// カテゴリ定義（アイコンのみ、ラベルなし）
export const STAMP_CATEGORIES: StampCategoryInfo[] = [
  { id: "recent", icon: "time-outline" },      // 最近使った
  { id: "face", icon: "happy-outline" },       // 顔
  { id: "gesture", icon: "hand-left-outline" }, // ジェスチャー
  { id: "symbol", icon: "heart-outline" },     // シンボル
];

export const STAMPS: Stamp[] = [
  // 顔・表情（10種類）
  { id: "happy_001", emoji: "😊", label: "嬉しい", category: "face" },
  { id: "love_001", emoji: "😍", label: "好き", category: "face" },
  { id: "laugh_001", emoji: "😂", label: "笑", category: "face" },
  { id: "excited_001", emoji: "🤩", label: "興奮", category: "face" },
  { id: "cool_001", emoji: "😎", label: "かっこいい", category: "face" },
  { id: "think_001", emoji: "🤔", label: "考え中", category: "face" },
  { id: "surprise_001", emoji: "😮", label: "驚き", category: "face" },
  { id: "sleepy_001", emoji: "😴", label: "眠い", category: "face" },
  { id: "sad_001", emoji: "😢", label: "悲しい", category: "face" },
  { id: "sweat_001", emoji: "😅", label: "汗", category: "face" },

  // ジェスチャー（10種類）
  { id: "clap_001", emoji: "👏", label: "拍手", category: "gesture" },
  { id: "thumbsup_001", emoji: "👍", label: "いいね", category: "gesture" },
  { id: "wave_001", emoji: "👋", label: "手を振る", category: "gesture" },
  { id: "ok_001", emoji: "👌", label: "OK", category: "gesture" },
  { id: "pray_001", emoji: "🙏", label: "お願い", category: "gesture" },
  { id: "shrug_001", emoji: "🤷", label: "わからない", category: "gesture" },
  { id: "muscle_001", emoji: "💪", label: "頑張る", category: "gesture" },
  { id: "peace_001", emoji: "✌️", label: "ピース", category: "gesture" },
  { id: "fist_001", emoji: "✊", label: "ファイト", category: "gesture" },
  { id: "point_001", emoji: "👉", label: "これ", category: "gesture" },

  // シンボル（10種類）
  { id: "heart_001", emoji: "❤️", label: "ハート", category: "symbol" },
  { id: "fire_001", emoji: "🔥", label: "アツい", category: "symbol" },
  { id: "sparkle_001", emoji: "✨", label: "キラキラ", category: "symbol" },
  { id: "star_001", emoji: "⭐", label: "スター", category: "symbol" },
  { id: "sun_001", emoji: "☀️", label: "晴れ", category: "symbol" },
  { id: "moon_001", emoji: "🌙", label: "月", category: "symbol" },
  { id: "rainbow_001", emoji: "🌈", label: "虹", category: "symbol" },
  { id: "music_001", emoji: "🎵", label: "音楽", category: "symbol" },
  { id: "question_001", emoji: "❓", label: "質問", category: "symbol" },
  { id: "exclaim_001", emoji: "❗", label: "注目", category: "symbol" },
];

/**
 * カテゴリ別にスタンプを取得
 */
export function getStampsByCategory(category: StampCategory): Stamp[] {
  return STAMPS.filter((stamp) => stamp.category === category);
}

/**
 * IDでスタンプを取得
 */
export function getStampById(id: string): Stamp | undefined {
  return STAMPS.find((stamp) => stamp.id === id);
}

/**
 * スタンプIDが有効かどうかを検証
 */
export function isValidStampId(id: string): boolean {
  return STAMPS.some((stamp) => stamp.id === id);
}

/**
 * スタンプIDから絵文字を取得
 */
export function getStampEmoji(id: string): string | undefined {
  return getStampById(id)?.emoji;
}
