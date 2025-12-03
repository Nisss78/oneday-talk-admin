/**
 * 入力検証とサニタイズ用のユーティリティ関数
 */

/**
 * 文字列をサニタイズ（XSS対策）
 * HTMLタグ、JavaScriptイベントハンドラ、危険なプロトコルを除去
 */
export function sanitizeString(input: string): string {
  if (!input) return "";

  let sanitized = input;

  // 1. URLエンコードされた攻撃をデコード（複数回実行して多重エンコード対策）
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(sanitized);
      if (decoded === sanitized) break; // これ以上デコードできない
      sanitized = decoded;
    } catch {
      break; // デコードエラーで停止
    }
  }

  // 2. 危険なプロトコルを除去（javascript:, data:, vbscript: など）
  sanitized = sanitized.replace(
    /(?:javascript|data|vbscript|about|file):/gi,
    ""
  );

  // 3. イベントハンドラを除去（on* 属性）
  sanitized = sanitized.replace(
    /\s*on\w+\s*=\s*["']?[^"']*["']?/gi,
    ""
  );

  // 4. HTMLタグを除去（より包括的なパターン）
  sanitized = sanitized.replace(
    /<\s*\/?[a-z][a-z0-9]*[^>]*>/gi,
    ""
  );

  // 5. 残った < > を除去
  sanitized = sanitized.replace(/[<>]/g, "");

  // 6. スクリプトタグの内容を除去（念のため）
  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );

  // 7. 特殊文字をエスケープ（&, ", ', など）
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  return sanitized.trim();
}

/**
 * 表示名のバリデーション
 */
export function validateDisplayName(displayName: string): { valid: boolean; error?: string } {
  const sanitized = sanitizeString(displayName);

  if (sanitized.length === 0) {
    return { valid: false, error: "表示名は必須です" };
  }

  if (sanitized.length > 50) {
    return { valid: false, error: "表示名は50文字以内にしてください" };
  }

  return { valid: true };
}

/**
 * ひとことのバリデーション
 */
export function validateBio(bio: string | null | undefined): { valid: boolean; error?: string } {
  if (!bio) return { valid: true };

  const sanitized = sanitizeString(bio);

  if (sanitized.length > 200) {
    return { valid: false, error: "ひとことは200文字以内にしてください" };
  }

  return { valid: true };
}

/**
 * タグのバリデーション
 */
export function validateTags(tags: string[]): { valid: boolean; error?: string } {
  if (tags.length > 10) {
    return { valid: false, error: "タグは10個まで設定できます" };
  }

  for (const tag of tags) {
    const sanitized = sanitizeString(tag);

    if (sanitized.length === 0) {
      return { valid: false, error: "空のタグは設定できません" };
    }

    if (sanitized.length > 20) {
      return { valid: false, error: "各タグは20文字以内にしてください" };
    }
  }

  return { valid: true };
}

/**
 * 話題カードのバリデーション
 */
export function validateTopics(topics: Array<{ title: string; description: string }>): { valid: boolean; error?: string } {
  if (topics.length > 5) {
    return { valid: false, error: "話題カードは5個まで設定できます" };
  }

  for (const topic of topics) {
    const sanitizedTitle = sanitizeString(topic.title);
    const sanitizedDescription = sanitizeString(topic.description);

    if (sanitizedTitle.length === 0) {
      return { valid: false, error: "話題カードのタイトルは必須です" };
    }

    if (sanitizedTitle.length > 50) {
      return { valid: false, error: "話題カードのタイトルは50文字以内にしてください" };
    }

    if (sanitizedDescription.length > 200) {
      return { valid: false, error: "話題カードの説明は200文字以内にしてください" };
    }
  }

  return { valid: true };
}

/**
 * メッセージ内容のバリデーション
 */
export function validateMessage(content: string): { valid: boolean; error?: string } {
  const sanitized = sanitizeString(content);

  if (sanitized.length === 0) {
    return { valid: false, error: "メッセージが空です" };
  }

  if (sanitized.length > 1000) {
    return { valid: false, error: "メッセージは1000文字以内にしてください" };
  }

  return { valid: true };
}

/**
 * フォトストーリーのバリデーション
 */
export function validatePhotoStories(
  photoStories: Array<{ imageUrl: string; caption: string }>
): { valid: boolean; error?: string } {
  if (photoStories.length > 5) {
    return { valid: false, error: "フォトストーリーは5枚まで設定できます" };
  }

  for (const story of photoStories) {
    // 空のimageUrlは許可（画像未設定の状態）
    if (story.imageUrl && story.imageUrl.trim().length > 0) {
      // URLの基本的な形式チェック
      // 相対URL、データURL、Convexストレージパスなども許可
      try {
        // 絶対URLの場合のみ厳密にチェック
        if (story.imageUrl.startsWith('http://') || story.imageUrl.startsWith('https://')) {
          new URL(story.imageUrl);
        }
        // それ以外（相対パス、データURL、Convexストレージパスなど）は許可
      } catch (error) {
        return { valid: false, error: `無効な画像URLです: ${story.imageUrl}` };
      }
    }

    // キャプションの長さチェック
    const sanitizedCaption = sanitizeString(story.caption);
    if (sanitizedCaption.length > 100) {
      return { valid: false, error: "キャプションは100文字以内にしてください" };
    }
  }

  return { valid: true };
}

/**
 * ハンドルのバリデーション
 */
export function validateHandle(handle: string): { valid: boolean; error?: string } {
  // ハンドルは英数字とアンダースコアのみ
  const handleRegex = /^[a-zA-Z0-9_]+$/;

  if (!handleRegex.test(handle)) {
    return { valid: false, error: "ハンドルは英数字とアンダースコアのみ使用できます" };
  }

  if (handle.length < 3) {
    return { valid: false, error: "ハンドルは3文字以上にしてください" };
  }

  if (handle.length > 20) {
    return { valid: false, error: "ハンドルは20文字以内にしてください" };
  }

  return { valid: true };
}
