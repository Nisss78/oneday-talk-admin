"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Flag, User, Calendar, AlertTriangle, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed" | "all";

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-800", icon: <Clock className="h-4 w-4" /> },
  reviewed: { bg: "bg-blue-100", text: "text-blue-800", icon: <AlertTriangle className="h-4 w-4" /> },
  resolved: { bg: "bg-green-100", text: "text-green-800", icon: <CheckCircle className="h-4 w-4" /> },
  dismissed: { bg: "bg-gray-100", text: "text-gray-800", icon: <XCircle className="h-4 w-4" /> },
};

export default function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("all");
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [newStatus, setNewStatus] = useState<"pending" | "reviewed" | "resolved" | "dismissed">("reviewed");

  const reports = useQuery(api.adminReports.listReports, { status: statusFilter, limit: 100 });
  const stats = useQuery(api.adminReports.getReportStats);
  const updateStatus = useMutation(api.adminReports.updateReportStatus);

  const handleUpdateStatus = async (reportId: Id<"reports">) => {
    try {
      await updateStatus({
        reportId,
        status: newStatus,
        adminNote: adminNote || undefined,
      });
      setSelectedReport(null);
      setAdminNote("");
    } catch (error) {
      console.error("Failed to update report:", error);
      alert("更新に失敗しました");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通報管理</h1>
          <p className="text-gray-500 mt-1">ユーザーからの通報を確認・対応</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">総通報数</div>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            <div className="text-sm text-yellow-600">未対応</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{stats.reviewed}</div>
            <div className="text-sm text-blue-600">確認中</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{stats.resolved}</div>
            <div className="text-sm text-green-600">解決済み</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{stats.dismissed}</div>
            <div className="text-sm text-gray-600">却下</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {[
          { value: "all", label: "すべて" },
          { value: "pending", label: "未対応" },
          { value: "reviewed", label: "確認中" },
          { value: "resolved", label: "解決済み" },
          { value: "dismissed", label: "却下" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value as ReportStatus)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.value
                ? "bg-teal-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {!reports ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Flag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            通報がありません
          </h3>
          <p className="text-gray-500">
            {statusFilter === "all" ? "まだ通報は届いていません" : `「${statusFilter}」の通報はありません`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report._id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              {/* Report Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[report.status]?.bg} ${STATUS_STYLES[report.status]?.text}`}
                    >
                      {STATUS_STYLES[report.status]?.icon}
                      {report.statusLabel}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {report.reasonLabel}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(report.createdAt)}
                  </div>
                </div>
              </div>

              {/* Report Body */}
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Reporter */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                      {report.reporter.avatarUrl ? (
                        <img
                          src={report.reporter.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">通報者</div>
                      <div className="text-sm font-medium text-gray-900">
                        {report.reporter.displayName}
                      </div>
                      <div className="text-xs text-gray-500">@{report.reporter.handle}</div>
                    </div>
                  </div>

                  {/* Reported User */}
                  <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                      {report.reportedUser.avatarUrl ? (
                        <img
                          src={report.reportedUser.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-red-600">被通報者</div>
                      <div className="text-sm font-medium text-gray-900">
                        {report.reportedUser.displayName}
                      </div>
                      <div className="text-xs text-gray-500">@{report.reportedUser.handle}</div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {report.description && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <MessageSquare className="h-3 w-3" />
                      通報内容
                    </div>
                    <p className="text-sm text-gray-700">{report.description}</p>
                  </div>
                )}

                {/* Admin Note (if exists) */}
                {report.adminNote && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-xs text-blue-600 mb-1">管理者メモ</div>
                    <p className="text-sm text-gray-700">{report.adminNote}</p>
                    {report.reviewedBy && (
                      <div className="text-xs text-gray-500 mt-2">
                        対応者: {report.reviewedBy.displayName} ({formatDate(report.reviewedAt!)})
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {selectedReport === report._id ? (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ステータス変更
                      </label>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as typeof newStatus)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="pending">未対応</option>
                        <option value="reviewed">確認中</option>
                        <option value="resolved">解決済み</option>
                        <option value="dismissed">却下</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        管理者メモ（任意）
                      </label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="対応内容や備考を入力..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(report._id as Id<"reports">)}
                        className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                      >
                        更新
                      </button>
                      <button
                        onClick={() => {
                          setSelectedReport(null);
                          setAdminNote("");
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedReport(report._id);
                      setNewStatus(report.status as typeof newStatus);
                      setAdminNote(report.adminNote || "");
                    }}
                    className="w-full py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  >
                    対応する
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Count */}
      {reports && reports.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          {statusFilter === "all" ? "全" : `「${statusFilter}」の`} {reports.length} 件の通報
        </div>
      )}
    </div>
  );
}
