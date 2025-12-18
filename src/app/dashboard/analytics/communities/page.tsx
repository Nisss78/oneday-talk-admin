"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useState } from "react";
import { Building2, UserPlus, Link2, Trophy, TrendingUp, CheckCircle, XCircle } from "lucide-react";

const COLORS = ["#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"];

type Period = "daily" | "weekly" | "monthly";

export default function CommunitiesAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("daily");

  const memberTrends = useQuery(api.analytics.getCommunityMemberTrends, { period, limit: 5 });
  const joinRequestStats = useQuery(api.analytics.getJoinRequestStats);
  const inviteCodeStats = useQuery(api.analytics.getInviteCodeStats, { limit: 10 });
  const communityRanking = useQuery(api.analytics.getCommunityActivityRanking, { limit: 10 });

  const isLoading = !memberTrends || !joinRequestStats || !inviteCodeStats || !communityRanking;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  // Transform member trends for chart
  type ChartDataItem = { date: string; [key: string]: string | number };
  const chartData = memberTrends.trends.reduce((acc: ChartDataItem[], trend) => {
    trend.data.forEach((point) => {
      const existing = acc.find((d) => d.date === point.date);
      if (existing) {
        existing[trend.communityName] = point.memberCount;
      } else {
        acc.push({
          date: point.date,
          [trend.communityName]: point.memberCount,
        });
      }
    });
    return acc;
  }, []);

  // Sort by date
  chartData.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Communities */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">コミュニティ総数</p>
              <p className="text-2xl font-bold text-gray-900">{communityRanking.length}</p>
            </div>
            <div className="p-3 bg-teal-100 rounded-full">
              <Building2 className="h-6 w-6 text-teal-600" />
            </div>
          </div>
        </div>

        {/* Join Request Approval Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">参加リクエスト承認率</p>
              <p className="text-2xl font-bold text-gray-900">{joinRequestStats.approvalRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">
                承認: {joinRequestStats.approved} / 拒否: {joinRequestStats.rejected}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <UserPlus className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Pending Requests */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">保留中のリクエスト</p>
              <p className="text-2xl font-bold text-gray-900">{joinRequestStats.pending}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Active Invite Codes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">招待コード総利用数</p>
              <p className="text-2xl font-bold text-gray-900">
                {inviteCodeStats.reduce((sum, code) => sum + code.usageCount, 0)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Link2 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Member Growth Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">コミュニティメンバー推移</h3>
          <div className="flex space-x-2">
            {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  period === p
                    ? "bg-teal-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p === "daily" ? "日次" : p === "weekly" ? "週次" : "月次"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              {memberTrends.trends.map((trend, index) => (
                <Line
                  key={trend.communityId}
                  type="monotone"
                  dataKey={trend.communityName}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ fill: COLORS[index % COLORS.length], strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Community Rankings & Invite Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Community Activity Ranking */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Trophy className="h-5 w-5 text-amber-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">アクティビティランキング</h3>
          </div>
          <div className="space-y-3">
            {communityRanking.map((community, index) => (
              <div key={community.communityId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold ${
                      index === 0
                        ? "bg-amber-100 text-amber-600"
                        : index === 1
                        ? "bg-gray-200 text-gray-600"
                        : index === 2
                        ? "bg-orange-100 text-orange-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">{community.name}</p>
                    <p className="text-xs text-gray-500">{community.memberCount} メンバー</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-teal-600">{community.sessionCount}</p>
                  <p className="text-xs text-gray-500">セッション</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Code Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Link2 className="h-5 w-5 text-purple-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">招待コード効果</h3>
          </div>
          <div className="space-y-3">
            {inviteCodeStats.length === 0 ? (
              <p className="text-gray-500 text-center py-4">招待コードのデータがありません</p>
            ) : (
              inviteCodeStats.map((code) => (
                <div key={code.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-mono font-medium text-gray-900">{code.code}</p>
                    <p className="text-xs text-gray-500">{code.communityName}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-purple-600">{code.usageCount}</p>
                      <p className="text-xs text-gray-500">利用</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-600">
                        {code.maxUses ? `${code.maxUses}` : "∞"}
                      </p>
                      <p className="text-xs text-gray-500">上限</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Join Request Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">参加リクエスト内訳</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center p-4 bg-green-50 rounded-lg">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-green-600">{joinRequestStats.approved}</p>
              <p className="text-sm text-green-700">承認済み</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-red-50 rounded-lg">
            <XCircle className="h-8 w-8 text-red-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-red-600">{joinRequestStats.rejected}</p>
              <p className="text-sm text-red-700">拒否</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-amber-50 rounded-lg">
            <TrendingUp className="h-8 w-8 text-amber-500 mr-3" />
            <div>
              <p className="text-2xl font-bold text-amber-600">{joinRequestStats.pending}</p>
              <p className="text-sm text-amber-700">保留中</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
