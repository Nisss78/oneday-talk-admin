# huuhuu? 管理画面

huuhuu? アプリの管理画面です。Next.js + Convex + Clerk で構築されています。

## セットアップ

### 1. Clerkの設定

1. [Clerk Dashboard](https://dashboard.clerk.com/) にアクセス
2. モバイルアプリと同じアプリケーションを選択（または新規作成）
3. **API Keys** から以下をコピー:
   - `Publishable Key` → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `Secret Key` → `CLERK_SECRET_KEY`

4. `.env.local` を編集して上記のキーを設定

### 2. 初期管理者の設定

Convexダッシュボードから初期管理者を設定します：

1. [Convex Dashboard](https://dashboard.convex.dev/) にアクセス
2. プロジェクト `moonlit-narwhal-144` を選択
3. **Functions** タブで `admin:initializeSuperAdmin` を実行
4. 引数に自分のメールアドレスを入力:
   ```json
   { "email": "your-email@example.com" }
   ```

### 3. 開発サーバーの起動

```bash
cd oneday-talk-admin
npm run dev
```

http://localhost:3000 にアクセス

## 機能

- **ダッシュボード**: ユーザー数、コミュニティ数、セッション数などの統計
- **コミュニティ管理**: 公式コミュニティの作成・編集
- **イベント管理**: コミュニティイベントの管理
- **メディア管理**: お知らせや広告の管理
- **ユーザー管理**: ユーザー一覧の表示
- **管理者設定**: 管理者の追加・削除（super_admin のみ）

## 管理者権限

- **super_admin**: 全権限（他の管理者の追加・削除も可能）
- **admin**: 通常の管理権限（コミュニティ・イベント・メディアの管理）

## デプロイ

Vercelにデプロイする場合：

1. GitHubにプッシュ
2. Vercelでプロジェクトをインポート
3. 環境変数を設定:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
