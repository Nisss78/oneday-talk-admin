"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

// アプリのディープリンクスキーム
const APP_SCHEME = "huuhuu";
// Web経由の認証URL（Convex HTTP endpoint）
const getVerificationUrl = (token: string) => {
  const convexUrl = process.env.CONVEX_SITE_URL;
  if (!convexUrl) {
    throw new Error("CONVEX_SITE_URL is not configured");
  }
  return `${convexUrl}/verify-email?token=${token}`;
};

/**
 * 認証メールを送信
 */
export const sendVerificationEmail = internalAction({
  args: {
    to: v.string(),
    token: v.string(),
    communityName: v.string(),
    verificationId: v.id("emailVerifications"),
  },
  handler: async (ctx, args) => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      throw new Error("Email service is not configured");
    }

    const resend = new Resend(resendApiKey);

    const verificationUrl = getVerificationUrl(args.token);

    // メールを送信
    const { data, error } = await resend.emails.send({
      from: "huuhuu <noreply@protoductai.com>",
      to: args.to,
      subject: `【huuhuu】${args.communityName} への参加認証`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>メール認証</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <tr>
              <td style="padding: 40px 30px; text-align: center;">
                <h1 style="color: #00C8B3; margin: 0 0 20px 0; font-size: 24px;">huuhuu</h1>
                <h2 style="color: #333; margin: 0 0 30px 0; font-size: 20px;">メールアドレスの認証</h2>

                <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                  <strong style="color: #333;">${args.communityName}</strong> への参加リクエストを受け付けました。
                </p>

                <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                  以下のボタンをクリックして、メールアドレスを認証してください。
                </p>

                <a href="${verificationUrl}"
                   style="display: inline-block; background-color: #00C8B3; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                  メールアドレスを認証
                </a>

                <p style="color: #999; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                  このリンクは24時間有効です。
                </p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                  このメールに心当たりがない場合は、無視してください。<br>
                  ボタンが機能しない場合は、以下のURLをブラウザにコピーしてください：
                </p>
                <p style="color: #999; font-size: 11px; word-break: break-all; margin: 10px 0 0 0;">
                  ${verificationUrl}
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
huuhuu - メールアドレスの認証

${args.communityName} への参加リクエストを受け付けました。

以下のリンクをクリックして、メールアドレスを認証してください：
${verificationUrl}

このリンクは24時間有効です。

このメールに心当たりがない場合は、無視してください。
      `.trim(),
    });

    if (error) {
      console.error("Failed to send verification email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log("Verification email sent:", data?.id);
    return { emailId: data?.id };
  },
});
