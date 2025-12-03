"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  ArrowLeft,
  Calendar,
  Image,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  MapPin,
  ExternalLink,
  Megaphone,
  Info,
  Bell,
  Users,
  Settings,
} from "lucide-react";

const mediaTypeLabels = {
  ad: { label: "広告", icon: Megaphone, color: "bg-orange-100 text-orange-700" },
  info: { label: "お役立ち情報", icon: Info, color: "bg-blue-100 text-blue-700" },
  announcement: { label: "お知らせ", icon: Bell, color: "bg-purple-100 text-purple-700" },
};

type TabType = "events" | "media" | "settings";

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.id as string;

  const communities = useQuery(api.admin.listOfficialCommunities);
  const community = communities?.find((c) => c._id === communityId);

  const events = useQuery(api.admin.listEventsForAdmin, { communityId: communityId as Id<"communities"> });
  const media = useQuery(api.admin.listMediaForAdmin, { communityId: communityId as Id<"communities"> });

  const createEvent = useMutation(api.admin.createEventForAdmin);
  const updateEvent = useMutation(api.admin.updateEventForAdmin);
  const deleteEvent = useMutation(api.admin.deleteEventForAdmin);

  const createMedia = useMutation(api.admin.createMediaForAdmin);
  const updateMedia = useMutation(api.admin.updateMediaForAdmin);
  const deleteMedia = useMutation(api.admin.deleteMediaForAdmin);

  const [activeTab, setActiveTab] = useState<TabType>("events");
  const [showEventModal, setShowEventModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [editingMedia, setEditingMedia] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // イベントフォーム
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    eventDate: "",
    eventEndDate: "",
    location: "",
    externalUrl: "",
    isPublished: false,
  });

  // メディアフォーム
  const [mediaForm, setMediaForm] = useState({
    title: "",
    content: "",
    imageUrl: "",
    externalUrl: "",
    mediaType: "info" as "ad" | "info" | "announcement",
    priority: 0,
    isPublished: false,
  });

  const resetEventForm = () => {
    setEventForm({
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

  const resetMediaForm = () => {
    setMediaForm({
      title: "",
      content: "",
      imageUrl: "",
      externalUrl: "",
      mediaType: "info",
      priority: 0,
      isPublished: false,
    });
    setEditingMedia(null);
  };

  const openEditEventModal = (event: any) => {
    setEditingEvent(event);
    setEventForm({
      title: event.title,
      description: event.description || "",
      eventDate: new Date(event.eventDate).toISOString().slice(0, 16),
      eventEndDate: event.eventEndDate ? new Date(event.eventEndDate).toISOString().slice(0, 16) : "",
      location: event.location || "",
      externalUrl: event.externalUrl || "",
      isPublished: event.isPublished,
    });
    setShowEventModal(true);
  };

  const openEditMediaModal = (item: any) => {
    setEditingMedia(item);
    setMediaForm({
      title: item.title,
      content: item.content || "",
      imageUrl: item.imageUrl || "",
      externalUrl: item.externalUrl || "",
      mediaType: item.mediaType,
      priority: item.priority || 0,
      isPublished: item.isPublished,
    });
    setShowMediaModal(true);
  };

  const handleEventSubmit = async () => {
    if (!eventForm.title.trim() || !eventForm.eventDate) {
      alert("タイトルと開催日時は必須です");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEvent) {
        await updateEvent({
          eventId: editingEvent._id,
          title: eventForm.title,
          description: eventForm.description || undefined,
          eventDate: new Date(eventForm.eventDate).getTime(),
          eventEndDate: eventForm.eventEndDate ? new Date(eventForm.eventEndDate).getTime() : undefined,
          location: eventForm.location || undefined,
          externalUrl: eventForm.externalUrl || undefined,
          isPublished: eventForm.isPublished,
        });
      } else {
        await createEvent({
          communityId: communityId as Id<"communities">,
          title: eventForm.title,
          description: eventForm.description || undefined,
          eventDate: new Date(eventForm.eventDate).getTime(),
          eventEndDate: eventForm.eventEndDate ? new Date(eventForm.eventEndDate).getTime() : undefined,
          location: eventForm.location || undefined,
          externalUrl: eventForm.externalUrl || undefined,
          isPublished: eventForm.isPublished,
        });
      }
      setShowEventModal(false);
      resetEventForm();
    } catch (error) {
      alert("エラーが発生しました: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMediaSubmit = async () => {
    if (!mediaForm.title.trim()) {
      alert("タイトルは必須です");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingMedia) {
        await updateMedia({
          mediaId: editingMedia._id,
          title: mediaForm.title,
          content: mediaForm.content || undefined,
          imageUrl: mediaForm.imageUrl || undefined,
          externalUrl: mediaForm.externalUrl || undefined,
          mediaType: mediaForm.mediaType,
          priority: mediaForm.priority,
          isPublished: mediaForm.isPublished,
        });
      } else {
        await createMedia({
          communityId: communityId as Id<"communities">,
          title: mediaForm.title,
          content: mediaForm.content || undefined,
          imageUrl: mediaForm.imageUrl || undefined,
          externalUrl: mediaForm.externalUrl || undefined,
          mediaType: mediaForm.mediaType,
          priority: mediaForm.priority,
          isPublished: mediaForm.isPublished,
        });
      }
      setShowMediaModal(false);
      resetMediaForm();
    } catch (error) {
      alert("エラーが発生しました: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: Id<"communityEvents">) => {
    if (!confirm("このイベントを削除しますか？")) return;
    try {
      await deleteEvent({ eventId });
    } catch (error) {
      alert("削除に失敗しました: " + (error as Error).message);
    }
  };

  const handleDeleteMedia = async (mediaId: Id<"communityMedia">) => {
    if (!confirm("このメディアを削除しますか？")) return;
    try {
      await deleteMedia({ mediaId });
    } catch (error) {
      alert("削除に失敗しました: " + (error as Error).message);
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

  if (!community) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/dashboard/communities")}
          className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          コミュニティ一覧に戻る
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
            <p className="text-gray-500 mt-1">
              {community.description || "説明なし"} · メンバー {community.memberCount}人
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab("events")}
            className={`py-3 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "events"
                ? "border-teal-500 text-teal-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Calendar className="h-4 w-4" />
            イベント ({events?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("media")}
            className={`py-3 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "media"
                ? "border-teal-500 text-teal-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Image className="h-4 w-4" />
            メディア ({media?.length || 0})
          </button>
        </nav>
      </div>

      {/* Events Tab */}
      {activeTab === "events" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                resetEventForm();
                setShowEventModal(true);
              }}
              className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              イベントを追加
            </button>
          </div>

          {!events ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
              <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">イベントがありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event._id}
                  className={`bg-white rounded-lg shadow-sm border p-4 ${
                    isUpcoming(event.eventDate) ? "border-gray-100" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {event.isPublished ? (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">公開中</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">非公開</span>
                        )}
                        {!isUpcoming(event.eventDate) && (
                          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">終了</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900">{event.title}</h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
                        <span className="flex items-center">
                          <Clock className="h-3.5 w-3.5 mr-1" />
                          {formatDate(event.eventDate)}
                        </span>
                        {event.location && (
                          <span className="flex items-center">
                            <MapPin className="h-3.5 w-3.5 mr-1" />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateEvent({ eventId: event._id, isPublished: !event.isPublished })}
                        className={`p-1.5 rounded transition-colors ${
                          event.isPublished ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        {event.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => openEditEventModal(event)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event._id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Media Tab */}
      {activeTab === "media" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                resetMediaForm();
                setShowMediaModal(true);
              }}
              className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              メディアを追加
            </button>
          </div>

          {!media ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
            </div>
          ) : media.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
              <Image className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">メディアがありません</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {media.map((item) => {
                const TypeInfo = mediaTypeLabels[item.mediaType];
                const TypeIcon = TypeInfo.icon;
                return (
                  <div key={item._id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    {item.imageUrl && (
                      <div className="aspect-video bg-gray-100">
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center ${TypeInfo.color}`}>
                          <TypeIcon className="h-3 w-3 mr-1" />
                          {TypeInfo.label}
                        </span>
                        {item.isPublished ? (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">公開中</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">非公開</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">{item.title}</h3>
                      <div className="flex items-center justify-end gap-1 mt-2">
                        <button
                          onClick={() => updateMedia({ mediaId: item._id, isPublished: !item.isPublished })}
                          className={`p-1.5 rounded transition-colors ${
                            item.isPublished ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"
                          }`}
                        >
                          {item.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => openEditMediaModal(item)}
                          className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMedia(item._id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingEvent ? "イベントを編集" : "イベントを追加"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="イベント名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">開催日時 *</label>
                  <input
                    type="datetime-local"
                    value={eventForm.eventDate}
                    onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">終了日時</label>
                  <input
                    type="datetime-local"
                    value={eventForm.eventEndDate}
                    onChange={(e) => setEventForm({ ...eventForm, eventEndDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">場所</label>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">外部リンク</label>
                <input
                  type="url"
                  value={eventForm.externalUrl}
                  onChange={(e) => setEventForm({ ...eventForm, externalUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="eventPublished"
                  checked={eventForm.isPublished}
                  onChange={(e) => setEventForm({ ...eventForm, isPublished: e.target.checked })}
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <label htmlFor="eventPublished" className="ml-2 text-sm text-gray-700">公開する</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowEventModal(false); resetEventForm(); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleEventSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "保存中..." : editingEvent ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Modal */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingMedia ? "メディアを編集" : "メディアを追加"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">種類 *</label>
                <select
                  value={mediaForm.mediaType}
                  onChange={(e) => setMediaForm({ ...mediaForm, mediaType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="info">お役立ち情報</option>
                  <option value="announcement">お知らせ</option>
                  <option value="ad">広告</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                <input
                  type="text"
                  value={mediaForm.title}
                  onChange={(e) => setMediaForm({ ...mediaForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                <textarea
                  value={mediaForm.content}
                  onChange={(e) => setMediaForm({ ...mediaForm, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">画像URL</label>
                <input
                  type="url"
                  value={mediaForm.imageUrl}
                  onChange={(e) => setMediaForm({ ...mediaForm, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">外部リンク</label>
                <input
                  type="url"
                  value={mediaForm.externalUrl}
                  onChange={(e) => setMediaForm({ ...mediaForm, externalUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                <input
                  type="number"
                  value={mediaForm.priority}
                  onChange={(e) => setMediaForm({ ...mediaForm, priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  min={0}
                  max={100}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="mediaPublished"
                  checked={mediaForm.isPublished}
                  onChange={(e) => setMediaForm({ ...mediaForm, isPublished: e.target.checked })}
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                />
                <label htmlFor="mediaPublished" className="ml-2 text-sm text-gray-700">公開する</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowMediaModal(false); resetMediaForm(); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleMediaSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "保存中..." : editingMedia ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
