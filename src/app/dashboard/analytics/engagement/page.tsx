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
  Cell,
} from "recharts";
import { CheckCircle, MessageCircle, Clock, TrendingUp, Crown } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function EngagementAnalyticsPage() {
  const sessionCompletion = useQuery(api.analytics.getSessionCompletionRate, {});
  const averageMessages = useQuery(api.analytics.getAverageMessagesPerSession, {});
  const usageHeatmap = useQuery(api.analytics.getUsageHeatmap, {});
  const mostActiveUsers = useQuery(api.analytics.getMostActiveUsers, { limit: 10 });
  const inactiveUsers = useQuery(api.analytics.getInactiveUsers, { daysInactive: 30, limit: 10 });

  const isLoading = !sessionCompletion || !averageMessages || !usageHeatmap || !mostActiveUsers || !inactiveUsers;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  // Heatmap data processing
  const heatmapData = DAYS.map((day, dayIndex) => {
    const dayData: Record<string, number | string> = { day };
    HOURS.forEach((hour) => {
      const found = usageHeatmap.find(
        (item) => item.dayOfWeek === dayIndex && item.hour === hour
      );
      dayData[`h${hour}`] = found?.count || 0;
    });
    return dayData;
  });

  const maxHeatmapValue = Math.max(...usageHeatmap.map((item) => item.count), 1);

  const getHeatmapColor = (value: number) => {
    const intensity = value / maxHeatmapValue;
    if (intensity === 0) return "#f3f4f6";
    if (intensity < 0.25) return "#ccfbf1";
    if (intensity < 0.5) return "#5eead4";
    if (intensity < 0.75) return "#14b8a6";
    return "#0d9488";
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Session Completion Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">セッション完了率</p>
              <p className="text-2xl font-bold text-gray-900">{sessionCompletion.completionRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">
                {sessionCompletion.completedSessions.toLocaleString()} / {sessionCompletion.totalSessions.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Average Messages */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">平均メッセージ数/セッション</p>
              <p className="text-2xl font-bold text-gray-900">{averageMessages.averageMessages.toFixed(1)}</p>
              <p className="text-xs text-gray-400">総メッセージ: {averageMessages.totalMessages.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <MessageCircle className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Total Sessions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">総セッション数</p>
              <p className="text-2xl font-bold text-gray-900">{averageMessages.totalSessions.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">30日以上非アクティブ</p>
              <p className="text-2xl font-bold text-gray-900">{inactiveUsers.length}+</p>
              <p className="text-xs text-gray-400">リエンゲージメント対象</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-full">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Usage Heatmap */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">利用時間帯ヒートマップ</h3>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex items-center mb-2">
              <div className="w-8"></div>
              {HOURS.map((hour) => (
                <div key={hour} className="flex-1 text-center text-xs text-gray-500">
                  {hour}
                </div>
              ))}
            </div>
            {heatmapData.map((row, rowIndex) => (
              <div key={rowIndex} className="flex items-center mb-1">
                <div className="w-8 text-xs text-gray-500">{row.day}</div>
                {HOURS.map((hour) => {
                  const value = row[`h${hour}`] as number;
                  return (
                    <div
                      key={hour}
                      className="flex-1 h-6 mx-0.5 rounded"
                      style={{ backgroundColor: getHeatmapColor(value) }}
                      title={`${row.day} ${hour}時: ${value}件`}
                    />
                  );
                })}
              </div>
            ))}
            <div className="flex items-center justify-end mt-2 space-x-2">
              <span className="text-xs text-gray-500">少</span>
              <div className="flex space-x-1">
                {["#f3f4f6", "#ccfbf1", "#5eead4", "#14b8a6", "#0d9488"].map((color) => (
                  <div
                    key={color}
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500">多</span>
            </div>
          </div>
        </div>
      </div>

      {/* Most Active Users & Inactive Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Active Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Crown className="h-5 w-5 text-amber-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">アクティブユーザーランキング</h3>
          </div>
          <div className="space-y-3">
            {mostActiveUsers.map((user, index) => (
              <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
                    <p className="text-sm font-medium text-gray-900">{user.name || "名前未設定"}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-teal-600">{user.sessionCount} 回</p>
                  <p className="text-xs text-gray-500">セッション</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inactive Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Clock className="h-5 w-5 text-red-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">非アクティブユーザー</h3>
          </div>
          <div className="space-y-3">
            {inactiveUsers.length === 0 ? (
              <p className="text-gray-500 text-center py-4">30日以上非アクティブなユーザーはいません</p>
            ) : (
              inactiveUsers.map((user) => (
                <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.name || "名前未設定"}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{user.daysSinceLastActive} 日</p>
                    <p className="text-xs text-gray-500">未ログイン</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
