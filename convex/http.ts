import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// アプリのディープリンクスキーム
const APP_SCHEME = "huuhuu";

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Clerk Webhook用のエンドポイント（将来実装）
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // TODO: Clerk Webhookの処理を実装
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// メール認証コールバック
// ブラウザからアクセス → アプリへディープリンクリダイレクト
http.route({
  path: "/verify-email",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const webVerify = url.searchParams.get("web") === "true";

    if (!token) {
      return new Response(
        generateErrorHtml("無効なリンク", "認証トークンが見つかりません。"),
        {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    // Web上で認証を完了する場合
    if (webVerify) {
      try {
        const result = await ctx.runMutation(api.emailVerifications.verifyToken, { token });
        if (result.success) {
          return new Response(
            generateSuccessHtml(result.communityName || "コミュニティ"),
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }
      } catch (error: any) {
        return new Response(
          generateErrorHtml("認証エラー", error.message || "認証に失敗しました。"),
          {
            status: 400,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      }
    }

    // アプリへのディープリンクを生成
    const appDeepLink = `${APP_SCHEME}://verify-email/${token}`;
    const webVerifyUrl = `${url.origin}/verify-email?token=${token}&web=true`;

    // ブラウザ → アプリへリダイレクト
    // iOS/Androidではディープリンクが開く、開かない場合はフォールバック表示
    return new Response(generateRedirectHtml(appDeepLink, token, webVerifyUrl), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

/**
 * 認証成功ページHTML
 */
function generateSuccessHtml(communityName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>認証完了 - huuhuu</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #f5f5f5;
        }
        .container {
          text-align: center;
          padding: 40px 20px;
          max-width: 400px;
        }
        h1 {
          color: #00C8B3;
          margin-bottom: 20px;
        }
        .success-icon {
          width: 80px;
          height: 80px;
          background-color: #00C8B3;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        .success-icon::after {
          content: "✓";
          color: white;
          font-size: 40px;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
        .community-name {
          color: #00C8B3;
          font-weight: bold;
          font-size: 1.2em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>huuhuu</h1>
        <div class="success-icon"></div>
        <h2 style="color: #333;">認証完了！</h2>
        <p>
          <span class="community-name">${communityName}</span><br>
          への参加が完了しました。
        </p>
        <p>アプリを開いてコミュニティをお楽しみください。</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * アプリへリダイレクトするHTML
 */
function generateRedirectHtml(appDeepLink: string, token: string, webVerifyUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>メール認証 - huuhuu</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #f5f5f5;
        }
        .container {
          text-align: center;
          padding: 40px 20px;
          max-width: 400px;
        }
        h1 {
          color: #00C8B3;
          margin-bottom: 20px;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
        .button {
          display: inline-block;
          background-color: #00C8B3;
          color: white;
          text-decoration: none;
          padding: 15px 30px;
          border-radius: 8px;
          font-weight: bold;
          margin-top: 20px;
        }
        .loading {
          margin: 20px 0;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #00C8B3;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>huuhuu</h1>
        <div class="loading">
          <div class="spinner"></div>
        </div>
        <p>アプリを開いています...</p>
        <p id="fallback" style="display: none;">
          アプリが自動的に開かない場合は、<br>
          下のボタンをタップしてください。
        </p>
        <a href="${appDeepLink}" class="button" id="openApp" style="display: none;">
          アプリで開く
        </a>
        <p id="webFallback" style="display: none; margin-top: 20px;">
          <a href="${webVerifyUrl}" style="color: #00C8B3;">
            ブラウザで認証を完了する
          </a>
        </p>
      </div>
      <script>
        // 即座にディープリンクを試行
        window.location.href = "${appDeepLink}";

        // 2秒後にフォールバックUIを表示
        setTimeout(function() {
          document.getElementById('fallback').style.display = 'block';
          document.getElementById('openApp').style.display = 'inline-block';
          document.getElementById('webFallback').style.display = 'block';
          document.querySelector('.loading').style.display = 'none';
        }, 2000);
      </script>
    </body>
    </html>
  `;
}

/**
 * エラーページHTML
 */
function generateErrorHtml(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>エラー - huuhuu</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #f5f5f5;
        }
        .container {
          text-align: center;
          padding: 40px 20px;
          max-width: 400px;
        }
        h1 {
          color: #e74c3c;
          margin-bottom: 20px;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `;
}

export default http;

