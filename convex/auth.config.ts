export default {
  providers: [
    {
      // 管理画面用（開発）
      domain: "https://climbing-bison-23.clerk.accounts.dev",
      applicationID: "convex",
    },
    {
      // モバイルアプリ用（本番）
      domain: "https://clerk.huuhuu.jp",
      applicationID: "convex",
    },
  ],
};
