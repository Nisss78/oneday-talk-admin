"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-teal-600 mb-8">huuhuu? 管理画面</h1>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary: "bg-teal-500 hover:bg-teal-600",
              footerActionLink: "text-teal-500 hover:text-teal-600",
            },
          }}
        />
      </div>
    </div>
  );
}
