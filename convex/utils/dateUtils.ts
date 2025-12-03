/**
 * JST日付関連のユーティリティ関数
 * 全ファイルで統一して使用する
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // JST = UTC+9

/**
 * 現在の日付をJST形式で取得（YYYY-MM-DD）
 */
export function getCurrentDateJST(): string {
  const now = new Date();
  const jstDate = new Date(now.getTime() + JST_OFFSET_MS);
  return jstDate.toISOString().split('T')[0];
}

/**
 * 前日の日付をJST形式で取得（YYYY-MM-DD）
 */
export function getYesterdayDateJST(): string {
  const now = new Date();
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  jstNow.setDate(jstNow.getDate() - 1);
  return jstNow.toISOString().split('T')[0];
}

/**
 * 指定した日付がJST基準で今日かどうかを判定
 */
export function isToday(dateJst: string): boolean {
  return dateJst === getCurrentDateJST();
}

/**
 * 指定した日付がJST基準で今日より前かどうかを判定
 */
export function isBeforeToday(dateJst: string): boolean {
  return dateJst < getCurrentDateJST();
}
