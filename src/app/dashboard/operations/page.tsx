"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import {
  Download,
  Users,
  Building2,
  MessageCircle,
  Calendar,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
} from "lucide-react";

type ExportType = "users" | "communities" | "sessions" | "messages";

export default function OperationsPage() {
  const [selectedType, setSelectedType] = useState<ExportType | null>(null);
  const [days, setDays] = useState(30);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const usersData = useQuery(
    api.analytics.exportUsers,
    selectedType === "users" ? {} : "skip"
  );
  const communitiesData = useQuery(
    api.analytics.exportCommunities,
    selectedType === "communities" ? {} : "skip"
  );
  const sessionsData = useQuery(
    api.analytics.exportSessions,
    selectedType === "sessions" ? { days } : "skip"
  );
  const messagesData = useQuery(
    api.analytics.exportMessages,
    selectedType === "messages" ? { days } : "skip"
  );

  const exportOptions = [
    {
      type: "users" as ExportType,
      name: "ユーザー一覧",
      description: "全ユーザーのハンドル、メール、タグ情報など",
      icon: Users,
      color: "teal",
    },
    {
      type: "communities" as ExportType,
      name: "コミュニティ一覧",
      description: "コミュニティ名、メンバー数、作成日など",
      icon: Building2,
      color: "blue",
    },
    {
      type: "sessions" as ExportType,
      name: "セッション履歴",
      description: "セッション参加者、メッセージ数、ステータスなど",
      icon: Calendar,
      color: "purple",
      hasDays: true,
    },
    {
      type: "messages" as ExportType,
      name: "メッセージ履歴",
      description: "メッセージ内容（一部）、送信者、日時など",
      icon: MessageCircle,
      color: "amber",
      hasDays: true,
    },
  ];

  const convertToCSV = (data: Record<string, unknown>[]): string => {
    if (data.length === 0) return "";

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            const stringValue = String(value ?? "");
            // CSVエスケープ処理
            if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(",")
      ),
    ];

    return csvRows.join("\n");
  };

  const downloadCSV = (data: Record<string, unknown>[], filename: string) => {
    const csv = convertToCSV(data);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (type: ExportType) => {
    setSelectedType(type);
    setIsExporting(true);
    setExportSuccess(null);
  };

  // データ取得完了時にダウンロード実行
  const executeDownload = () => {
    if (!selectedType || !isExporting) return;

    let data: Record<string, unknown>[] | undefined;
    let filename: string = "";

    switch (selectedType) {
      case "users":
        data = usersData as Record<string, unknown>[] | undefined;
        filename = "users";
        break;
      case "communities":
        data = communitiesData as Record<string, unknown>[] | undefined;
        filename = "communities";
        break;
      case "sessions":
        data = sessionsData as Record<string, unknown>[] | undefined;
        filename = `sessions_${days}days`;
        break;
      case "messages":
        data = messagesData as Record<string, unknown>[] | undefined;
        filename = `messages_${days}days`;
        break;
    }

    if (data) {
      downloadCSV(data, filename);
      setIsExporting(false);
      setExportSuccess(exportOptions.find((o) => o.type === selectedType)?.name || "");
      setSelectedType(null);

      // 3秒後に成功メッセージをクリア
      setTimeout(() => setExportSuccess(null), 3000);
    }
  };

  // データ変更を監視してダウンロード実行
  if (isExporting && selectedType) {
    const data =
      selectedType === "users"
        ? usersData
        : selectedType === "communities"
        ? communitiesData
        : selectedType === "sessions"
        ? sessionsData
        : messagesData;

    if (data) {
      executeDownload();
    }
  }

  const getColorClasses = (color: string, isActive: boolean) => {
    const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
      teal: {
        bg: isActive ? "bg-teal-50" : "bg-white hover:bg-teal-50",
        icon: "bg-teal-100 text-teal-600",
        border: isActive ? "border-teal-500" : "border-gray-200 hover:border-teal-300",
      },
      blue: {
        bg: isActive ? "bg-blue-50" : "bg-white hover:bg-blue-50",
        icon: "bg-blue-100 text-blue-600",
        border: isActive ? "border-blue-500" : "border-gray-200 hover:border-blue-300",
      },
      purple: {
        bg: isActive ? "bg-purple-50" : "bg-white hover:bg-purple-50",
        icon: "bg-purple-100 text-purple-600",
        border: isActive ? "border-purple-500" : "border-gray-200 hover:border-purple-300",
      },
      amber: {
        bg: isActive ? "bg-amber-50" : "bg-white hover:bg-amber-50",
        icon: "bg-amber-100 text-amber-600",
        border: isActive ? "border-amber-500" : "border-gray-200 hover:border-amber-300",
      },
    };

    return colorMap[color] || colorMap.teal;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">データエクスポート</h1>
        <p className="text-gray-500 mt-1">各種データをCSV形式でダウンロード</p>
      </div>

      {/* Success Message */}
      {exportSuccess && (
        <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
          <span className="text-green-700">{exportSuccess}のエクスポートが完了しました</span>
        </div>
      )}

      {/* Days Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">期間設定（セッション・メッセージ用）</h3>
        <div className="flex items-center space-x-4">
          <label className="text-sm text-gray-600">取得期間:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value={7}>過去7日</option>
            <option value={14}>過去14日</option>
            <option value={30}>過去30日</option>
            <option value={60}>過去60日</option>
            <option value={90}>過去90日</option>
          </select>
        </div>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportOptions.map((option) => {
          const colors = getColorClasses(option.color, selectedType === option.type && isExporting);
          const Icon = option.icon;
          const isLoading = selectedType === option.type && isExporting;

          return (
            <button
              key={option.type}
              onClick={() => handleExport(option.type)}
              disabled={isExporting}
              className={`p-6 rounded-xl shadow-sm border-2 transition-all text-left ${colors.bg} ${colors.border} ${
                isExporting && selectedType !== option.type ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <div className={`p-3 rounded-full ${colors.icon}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{option.description}</p>
                    {option.hasDays && (
                      <p className="text-xs text-gray-400 mt-2">※ 期間設定が適用されます</p>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  {isLoading ? (
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  ) : (
                    <Download className="h-6 w-6 text-gray-400" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-start">
          <FileSpreadsheet className="h-6 w-6 text-gray-400 mr-3 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-gray-900">エクスポートについて</h4>
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              <li>• ファイルはCSV形式（UTF-8 BOM付き）でダウンロードされます</li>
              <li>• ExcelやGoogleスプレッドシートで開くことができます</li>
              <li>• メッセージ内容は最初の100文字のみ表示されます</li>
              <li>• 大量のデータがある場合、ダウンロードに時間がかかることがあります</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
