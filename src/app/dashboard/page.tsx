"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Users,
  Building2,
  MessageSquare,
  Calendar,
  Image,
  Activity,
  TrendingUp,
} from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtext && (
            <p className="text-xs text-gray-400 mt-1">{subtext}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const stats = useQuery(api.admin.getDashboardStats);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-500 mt-1">huuhuu? アプリの概要統計</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="総ユーザー数"
          value={stats.totalUsers}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="コミュニティ数"
          value={stats.totalCommunities}
          icon={Building2}
          color="bg-teal-500"
          subtext={`公式: ${stats.officialCommunities}件`}
        />
        <StatCard
          title="今日のセッション"
          value={stats.todaySessions}
          icon={Activity}
          color="bg-purple-500"
        />
        <StatCard
          title="今日のメッセージ"
          value={stats.todayMessages}
          icon={MessageSquare}
          color="bg-orange-500"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <StatCard
          title="今後のイベント"
          value={stats.upcomingEvents}
          icon={Calendar}
          color="bg-pink-500"
        />
        <StatCard
          title="公開中のメディア"
          value={stats.publishedMedia}
          icon={Image}
          color="bg-green-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">クイックアクション</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/dashboard/communities"
            className="flex items-center p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <Building2 className="h-5 w-5 text-teal-500 mr-3" />
            <span className="text-gray-700">公式コミュニティを管理</span>
          </a>
          <a
            href="/dashboard/events"
            className="flex items-center p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <Calendar className="h-5 w-5 text-teal-500 mr-3" />
            <span className="text-gray-700">イベントを作成</span>
          </a>
          <a
            href="/dashboard/users"
            className="flex items-center p-4 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <Users className="h-5 w-5 text-teal-500 mr-3" />
            <span className="text-gray-700">ユーザーを確認</span>
          </a>
        </div>
      </div>
    </div>
  );
}
