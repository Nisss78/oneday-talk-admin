"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, SignOutButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  Image,
  Settings,
  Shield,
  BarChart3,
  Download,
  LogOut,
  Flag,
} from "lucide-react";

const navigation = [
  { name: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { name: "アナリティクス", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "コミュニティ", href: "/dashboard/communities", icon: Building2 },
  { name: "イベント", href: "/dashboard/events", icon: Calendar },
  { name: "メディア", href: "/dashboard/media", icon: Image },
  { name: "ユーザー", href: "/dashboard/users", icon: Users },
  { name: "通報管理", href: "/dashboard/reports", icon: Flag },
  { name: "エクスポート", href: "/dashboard/operations", icon: Download },
  { name: "管理者設定", href: "/dashboard/admins", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-screen w-64 bg-white border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-gray-200">
        <span className="text-xl font-bold text-teal-600">huuhuu?</span>
        <span className="ml-2 text-sm text-gray-500">管理画面</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? "bg-teal-50 text-teal-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <item.icon
                className={`h-5 w-5 mr-3 ${
                  isActive ? "text-teal-600" : "text-gray-400"
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-200 space-y-3">
        <div className="flex items-center">
          <UserButton afterSignOutUrl="/" />
          <span className="ml-3 text-sm text-gray-700">アカウント</span>
        </div>
        <SignOutButton>
          <button className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors">
            <LogOut className="h-5 w-5 mr-3" />
            ログアウト
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
