"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Image, Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink, Megaphone, Info, Bell } from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

const mediaTypeLabels = {
  ad: { label: "広告", icon: Megaphone, color: "bg-orange-100 text-orange-700" },
  info: { label: "お役立ち情報", icon: Info, color: "bg-blue-100 text-blue-700" },
  announcement: { label: "お知らせ", icon: Bell, color: "bg-purple-100 text-purple-700" },
};

export default function MediaPage() {
  const communities = useQuery(api.admin.listOfficialCommunities);
  const media = useQuery(api.admin.listMediaForAdmin, {});
  const createMedia = useMutation(api.admin.createMediaForAdmin);
  const updateMedia = useMutation(api.admin.updateMediaForAdmin);
  const deleteMedia = useMutation(api.admin.deleteMediaForAdmin);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォームの状態
  const [formData, setFormData] = useState({
    communityId: "" as string,
    title: "",
    content: "",
    imageUrl: "",
    externalUrl: "",
    mediaType: "info" as "ad" | "info" | "announcement",
    priority: 0,
    isPublished: false,
  });

  const resetForm = () => {
    setFormData({
      communityId: "",
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

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingMedia(item);
    setFormData({
      communityId: item.communityId,
      title: item.title,
      content: item.content || "",
      imageUrl: item.imageUrl || "",
      externalUrl: item.externalUrl || "",
      mediaType: item.mediaType,
      priority: item.priority || 0,
      isPublished: item.isPublished,
    });
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      alert("タイトルは必須です");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingMedia) {
        await updateMedia({
          mediaId: editingMedia._id,
          title: formData.title,
          content: formData.content || undefined,
          imageUrl: formData.imageUrl || undefined,
          externalUrl: formData.externalUrl || undefined,
          mediaType: formData.mediaType,
          priority: formData.priority,
          isPublished: formData.isPublished,
        });
      } else {
        if (!formData.communityId) {
          alert("コミュニティを選択してください");
          setIsSubmitting(false);
          return;
        }
        await createMedia({
          communityId: formData.communityId as Id<"communities">,
          title: formData.title,
          content: formData.content || undefined,
          imageUrl: formData.imageUrl || undefined,
          externalUrl: formData.externalUrl || undefined,
          mediaType: formData.mediaType,
          priority: formData.priority,
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

  const handleDelete = async (mediaId: Id<"communityMedia">) => {
    if (!confirm("このメディアを削除しますか？")) return;

    try {
      await deleteMedia({ mediaId });
    } catch (error) {
      alert("削除に失敗しました: " + (error as Error).message);
    }
  };

  const handleTogglePublish = async (item: any) => {
    try {
      await updateMedia({
        mediaId: item._id,
        isPublished: !item.isPublished,
      });
    } catch (error) {
      alert("更新に失敗しました: " + (error as Error).message);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">メディア管理</h1>
          <p className="text-gray-500 mt-1">公式コミュニティのメディア・お知らせを管理</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          メディアを追加
        </button>
      </div>

      {/* Media List */}
      {!media ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : media.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Image className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            メディアがありません
          </h3>
          <p className="text-gray-500 mb-6">
            新しいメディアを作成しましょう
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            メディアを追加
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => {
            const TypeInfo = mediaTypeLabels[item.mediaType];
            const TypeIcon = TypeInfo.icon;
            return (
              <div
                key={item._id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {item.imageUrl && (
                  <div className="aspect-video bg-gray-100 relative">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
                      {item.communityName}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full flex items-center ${TypeInfo.color}`}>
                      <TypeIcon className="h-3 w-3 mr-1" />
                      {TypeInfo.label}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
                    {item.title}
                  </h3>
                  {item.content && (
                    <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                      {item.content}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>作成: {formatDate(item.createdAt)}</span>
                    <span>優先度: {item.priority}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {item.isPublished ? (
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
                    </div>
                    <div className="flex items-center gap-1">
                      {item.externalUrl && (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="リンクを開く"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleTogglePublish(item)}
                        className={`p-2 rounded-lg transition-colors ${
                          item.isPublished
                            ? "text-green-600 hover:bg-green-50"
                            : "text-gray-400 hover:bg-gray-100"
                        }`}
                        title={item.isPublished ? "非公開にする" : "公開する"}
                      >
                        {item.isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="編集"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item._id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingMedia ? "メディアを編集" : "メディアを追加"}
            </h2>

            <div className="space-y-4">
              {!editingMedia && (
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
                  種類 *
                </label>
                <select
                  value={formData.mediaType}
                  onChange={(e) => setFormData({ ...formData, mediaType: e.target.value as "ad" | "info" | "announcement" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="info">お役立ち情報</option>
                  <option value="announcement">お知らせ</option>
                  <option value="ad">広告</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイトル *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="タイトル"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  内容
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  rows={4}
                  placeholder="メディアの内容"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  画像URL
                </label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="https://..."
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  優先度（高いほど上に表示）
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  min={0}
                  max={100}
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
                {isSubmitting ? "保存中..." : editingMedia ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
