"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Calendar, Plus, MapPin, ExternalLink, Clock, Edit2, Trash2, Eye, EyeOff, CheckCircle, XCircle, AlertCircle, User, FileText } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

type TabType = "events" | "requests";
type RequestStatus = "pending" | "approved" | "rejected";

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("events");
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatus | "all">("pending");

  // イベント管理用
  const communities = useQuery(api.admin.listOfficialCommunities);
  const events = useQuery(api.admin.listEventsForAdmin, {});
  const createEvent = useMutation(api.admin.createEventForAdmin);
  const updateEvent = useMutation(api.admin.updateEventForAdmin);
  const deleteEvent = useMutation(api.admin.deleteEventForAdmin);

  // 申請管理用
  const eventRequests = useQuery(api.admin.listEventRequests, {
    status: requestStatusFilter === "all" ? undefined : requestStatusFilter,
  });
  const approveRequest = useMutation(api.admin.approveEventRequest);
  const rejectRequest = useMutation(api.admin.rejectEventRequest);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<Id<"communityEventRequests"> | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // フォームの状態
  const [formData, setFormData] = useState({
    communityId: "" as string,
    title: "",
    description: "",
    eventDate: "",
    eventEndDate: "",
    location: "",
    externalUrl: "",
    isPublished: false,
  });

  const resetForm = () => {
    setFormData({
      communityId: "",
      title: "",
      description: "",
      eventDate: "",
      eventEndDate: "",
      location: "",
      externalUrl: "",
      isPublished: false,
    });
    setEditingEvent(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (event: any) => {
    setEditingEvent(event);
    setFormData({
      communityId: event.communityId,
      title: event.title,
      description: event.description || "",
      eventDate: new Date(event.eventDate).toISOString().slice(0, 16),
      eventEndDate: event.eventEndDate ? new Date(event.eventEndDate).toISOString().slice(0, 16) : "",
      location: event.location || "",
      externalUrl: event.externalUrl || "",
      isPublished: event.isPublished,
    });
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.eventDate) {
      alert("タイトルと開催日時は必須です");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEvent) {
        await updateEvent({
          eventId: editingEvent._id,
          title: formData.title,
          description: formData.description || undefined,
          eventDate: new Date(formData.eventDate).getTime(),
          eventEndDate: formData.eventEndDate ? new Date(formData.eventEndDate).getTime() : undefined,
          location: formData.location || undefined,
          externalUrl: formData.externalUrl || undefined,
          isPublished: formData.isPublished,
        });
      } else {
        if (!formData.communityId) {
          alert("コミュニティを選択してください");
          setIsSubmitting(false);
          return;
        }
        await createEvent({
          communityId: formData.communityId as Id<"communities">,
          title: formData.title,
          description: formData.description || undefined,
          eventDate: new Date(formData.eventDate).getTime(),
          eventEndDate: formData.eventEndDate ? new Date(formData.eventEndDate).getTime() : undefined,
          location: formData.location || undefined,
          externalUrl: formData.externalUrl || undefined,
          isPublished: formData.isPublished,
        });
      }
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      alert("エラーが発生しました: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (eventId: Id<"communityEvents">) => {
    if (!confirm("このイベントを削除しますか？")) return;

    try {
      await deleteEvent({ eventId });
    } catch (error) {
      alert("削除に失敗しました: " + (error as Error).message);
    }
  };

  const handleTogglePublish = async (event: any) => {
    try {
      await updateEvent({
        eventId: event._id,
        isPublished: !event.isPublished,
      });
    } catch (error) {
      alert("更新に失敗しました: " + (error as Error).message);
    }
  };

  const handleApproveRequest = async (requestId: Id<"communityEventRequests">) => {
    if (!confirm("この申請を承認しますか？承認するとイベントが自動で公開されます。")) return;

    setIsSubmitting(true);
    try {
      await approveRequest({ requestId });
      alert("申請を承認しました。イベントが公開されました。");
    } catch (error) {
      alert("承認に失敗しました: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectingRequestId) return;

    setIsSubmitting(true);
    try {
      await rejectRequest({
        requestId: rejectingRequestId,
        rejectionReason: rejectionReason || undefined,
      });
      alert("申請を却下しました。");
      setRejectingRequestId(null);
      setRejectionReason("");
    } catch (error) {
      alert("却下に失敗しました: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
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

  const isUpcoming = (eventDate: number) => eventDate > Date.now();

  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full flex items-center">
            <AlertCircle className="h-3 w-3 mr-1" />
            審査待ち
          </span>
        );
      case "approved":
        return (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center">
            <CheckCircle className="h-3 w-3 mr-1" />
            承認済み
          </span>
        );
      case "rejected":
        return (
          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full flex items-center">
            <XCircle className="h-3 w-3 mr-1" />
            却下
          </span>
        );
    }
  };

  const pendingCount = eventRequests?.filter(r => r.status === "pending").length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">イベント管理</h1>
          <p className="text-gray-500 mt-1">公式コミュニティのイベントを管理</p>
        </div>
        {activeTab === "events" && (
          <button
            onClick={openCreateModal}
            className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            イベントを追加
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("events")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "events"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            イベント一覧
          </div>
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "requests"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            申請管理
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {pendingCount}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Events Tab Content */}
      {activeTab === "events" && (
        <>
          {!events ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                イベントがありません
              </h3>
              <p className="text-gray-500 mb-6">
                新しいイベントを作成しましょう
              </p>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
              >
                <Plus className="h-5 w-5 mr-2" />
                イベントを追加
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event._id}
                  className={`bg-white rounded-xl shadow-sm border p-6 ${
                    isUpcoming(event.eventDate) ? "border-gray-100" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
                          {event.communityName}
                        </span>
                        {event.isPublished ? (
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center">
                            <Eye className="h-3 w-3 mr-1" />
                            公開中
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full flex items-center">
                            <EyeOff className="h-3 w-3 mr-1" />
                            非公開
                          </span>
                        )}
                        {!isUpcoming(event.eventDate) && (
                          <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">
                            終了
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {event.title}
                      </h3>
                      {event.description && (
                        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatDate(event.eventDate)}
                          {event.eventEndDate && ` 〜 ${formatDate(event.eventEndDate)}`}
                        </div>
                        {event.location && (
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1" />
                            {event.location}
                          </div>
                        )}
                        {event.externalUrl && (
                          <a
                            href={event.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-teal-600 hover:underline"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            詳細リンク
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleTogglePublish(event)}
                        className={`p-2 rounded-lg transition-colors ${
                          event.isPublished
                            ? "text-green-600 hover:bg-green-50"
                            : "text-gray-400 hover:bg-gray-100"
                        }`}
                        title={event.isPublished ? "非公開にする" : "公開する"}
                      >
                        {event.isPublished ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                      </button>
                      <button
                        onClick={() => openEditModal(event)}
                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="編集"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(event._id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="削除"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Requests Tab Content */}
      {activeTab === "requests" && (
        <>
          {/* Status Filter */}
          <div className="flex gap-2 mb-6">
            {[
              { value: "pending" as const, label: "審査待ち" },
              { value: "approved" as const, label: "承認済み" },
              { value: "rejected" as const, label: "却下" },
              { value: "all" as const, label: "すべて" },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setRequestStatusFilter(filter.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  requestStatusFilter === filter.value
                    ? "bg-teal-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {!eventRequests ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            </div>
          ) : eventRequests.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {requestStatusFilter === "pending" ? "審査待ちの申請はありません" : "申請がありません"}
              </h3>
              <p className="text-gray-500">
                メンバーからのイベント申請がここに表示されます
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {eventRequests.map((request) => (
                <div
                  key={request._id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
                          {request.communityName}
                        </span>
                        {getStatusBadge(request.status)}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {request.title}
                      </h3>
                      {request.description && (
                        <p className="text-gray-600 text-sm mb-3">
                          {request.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatDate(request.eventDate)}
                          {request.eventEndDate && ` 〜 ${formatDate(request.eventEndDate)}`}
                        </div>
                        {request.location && (
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1" />
                            {request.location}
                          </div>
                        )}
                        {request.externalUrl && (
                          <a
                            href={request.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-teal-600 hover:underline"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            詳細リンク
                          </a>
                        )}
                      </div>
                      {/* 申請者情報 */}
                      <div className="flex items-center gap-2 text-sm text-gray-500 pt-3 border-t border-gray-100">
                        <User className="h-4 w-4" />
                        <span>申請者: {request.requester?.displayName ?? request.requester?.handle ?? "不明"}</span>
                        <span className="text-gray-300">|</span>
                        <span>申請日: {formatDate(request.createdAt)}</span>
                      </div>
                      {/* 却下理由 */}
                      {request.status === "rejected" && request.rejectionReason && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                          <strong>却下理由:</strong> {request.rejectionReason}
                        </div>
                      )}
                    </div>
                    {/* アクションボタン */}
                    {request.status === "pending" && (
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleApproveRequest(request._id)}
                          disabled={isSubmitting}
                          className="flex items-center px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          承認
                        </button>
                        <button
                          onClick={() => setRejectingRequestId(request._id)}
                          disabled={isSubmitting}
                          className="flex items-center px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          却下
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create/Edit Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingEvent ? "イベントを編集" : "イベントを追加"}
            </h2>

            <div className="space-y-4">
              {!editingEvent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    コミュニティ *
                  </label>
                  <select
                    value={formData.communityId}
                    onChange={(e) => setFormData({ ...formData, communityId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">選択してください</option>
                    {communities?.map((community) => (
                      <option key={community._id} value={community._id}>
                        {community.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイトル *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="イベント名"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  rows={3}
                  placeholder="イベントの説明"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    開催日時 *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    終了日時
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.eventEndDate}
                    onChange={(e) => setFormData({ ...formData, eventEndDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  場所
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="開催場所"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  外部リンク
                </label>
                <input
                  type="url"
                  value={formData.externalUrl}
                  onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPublished"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <label htmlFor="isPublished" className="ml-2 text-sm text-gray-700">
                  公開する
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "保存中..." : editingEvent ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingRequestId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              申請を却下
            </h2>
            <p className="text-gray-600 mb-4">
              却下理由を入力してください（任意）
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
              rows={3}
              placeholder="却下理由を入力..."
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setRejectingRequestId(null);
                  setRejectionReason("");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleRejectRequest}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "処理中..." : "却下する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
