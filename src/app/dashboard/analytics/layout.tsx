"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Activity, Building2 } from "lucide-react";

const tabs = [
  { name: "ユーザー分析", href: "/dashboard/analytics/users", icon: Users },
  { name: "エンゲージメント", href: "/dashboard/analytics/engagement", icon: Activity },
  { name: "コミュニティ成長", href: "/dashboard/analytics/communities", icon: Building2 },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">アナリティクス</h1>
        <p className="text-gray-500 mt-1">アプリの詳細な統計情報</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  isActive
                    ? "border-teal-500 text-teal-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <tab.icon className={`h-5 w-5 mr-2 ${isActive ? "text-teal-500" : "text-gray-400"}`} />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
