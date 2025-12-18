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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  PieLabelRenderProps,
} from "recharts";
import { useState } from "react";
import { Users, UserCheck, Bell, Tag } from "lucide-react";

const COLORS = ["#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#ec4899"];

type Period = "daily" | "weekly" | "monthly";

export default function UsersAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("daily");

  const registrationTrend = useQuery(api.analytics.getUserRegistrationTrend, { period });
  const activeUserRate = useQuery(api.analytics.getActiveUserRate);
  const tagDistribution = useQuery(api.analytics.getTagDistribution, { limit: 10 });
  const pushOptInRate = useQuery(api.analytics.getPushOptInRate);

  const isLoading = !registrationTrend || !activeUserRate || !tagDistribution || !pushOptInRate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">総ユーザー数</p>
              <p className="text-2xl font-bold text-gray-900">{activeUserRate.totalUsers.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-teal-100 rounded-full">
              <Users className="h-6 w-6 text-teal-600" />
            </div>
          </div>
        </div>

        {/* Weekly Active Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">週間アクティブ率</p>
              <p className="text-2xl font-bold text-gray-900">{activeUserRate.weeklyActiveRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">{activeUserRate.weeklyActiveUsers.toLocaleString()} ユーザー</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <UserCheck className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Monthly Active Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">月間アクティブ率</p>
              <p className="text-2xl font-bold text-gray-900">{activeUserRate.monthlyActiveRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">{activeUserRate.monthlyActiveUsers.toLocaleString()} ユーザー</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <UserCheck className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Push Opt-in Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">プッシュ通知許可率</p>
              <p className="text-2xl font-bold text-gray-900">{pushOptInRate.optInRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">{pushOptInRate.optedInUsers.toLocaleString()} / {pushOptInRate.totalUsers.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-full">
              <Bell className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Registration Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">ユーザー登録推移</h3>
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
            <LineChart data={registrationTrend}>
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
              <Line
                type="monotone"
                dataKey="count"
                stroke="#14b8a6"
                strokeWidth={2}
                dot={{ fill: "#14b8a6", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#14b8a6" }}
                name="新規登録"
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                name="累計"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tag Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Tag className="h-5 w-5 text-teal-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">人気タグ分布</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tagDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="count"
                  nameKey="tag"
                  label={(props: PieLabelRenderProps) => {
                    const { name, percent } = props;
                    if (typeof name !== 'string' || typeof percent !== 'number') return '';
                    return `${name} (${(percent * 100).toFixed(0)}%)`;
                  }}
                  labelLine={false}
                >
                  {tagDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">タグ利用ランキング</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} />
                <YAxis
                  type="category"
                  dataKey="tag"
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  width={80}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} name="ユーザー数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
