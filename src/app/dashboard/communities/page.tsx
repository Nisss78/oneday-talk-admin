"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import {
  Building2,
  Plus,
  Users,
  Mail,
  Settings,
  MoreVertical,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function CommunitiesPage() {
  const communities = useQuery(api.admin.listOfficialCommunities);
  const createCommunity = useMutation(api.admin.createOfficialCommunity);
  const updateCommunity = useMutation(api.admin.updateOfficialCommunity);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommunity, setNewCommunity] = useState({
    name: "",
    description: "",
    requiredEmailDomains: "",
    maxMembers: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newCommunity.name.trim()) {
      alert("コミュニティ名を入力してください");
      return;
    }

    setIsCreating(true);
    try {
      const domains = newCommunity.requiredEmailDomains
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d);

      await createCommunity({
        name: newCommunity.name,
        description: newCommunity.description || undefined,
        requiredEmailDomains: domains,
        maxMembers: newCommunity.maxMembers ? parseInt(newCommunity.maxMembers) : undefined,
      });

      setShowCreateModal(false);
      setNewCommunity({
        name: "",
        description: "",
        requiredEmailDomains: "",
        maxMembers: "",
      });
    } catch (error) {
      alert("作成に失敗しました: " + (error as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleActive = async (communityId: string, currentActive: boolean) => {
    try {
      await updateCommunity({
        communityId: communityId as any,
        isActive: !currentActive,
      });
    } catch (error) {
      alert("更新に失敗しました: " + (error as Error).message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">公式コミュニティ</h1>
          <p className="text-gray-500 mt-1">公式コミュニティの管理</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" />
          新規作成
        </button>
      </div>

      {/* Communities List */}
      {!communities ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : communities.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            公式コミュニティがありません
          </h3>
          <p className="text-gray-500 mb-6">
            「新規作成」ボタンから公式コミュニティを作成してください
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  コミュニティ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  メンバー数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  許可ドメイン
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {communities.map((community) => (
                <tr key={community._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        {community.iconUrl ? (
                          <img
                            src={community.iconUrl}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <Building2 className="h-5 w-5 text-teal-600" />
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {community.name}
                        </div>
                        {community.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {community.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Users className="h-4 w-4 text-gray-400 mr-2" />
                      {community.memberCount}人
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {community.requiredEmailDomains?.map((domain, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          <Mail className="h-3 w-3 mr-1" />
                          {domain}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {community.isActive ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        有効
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <XCircle className="h-3 w-3 mr-1" />
                        無効
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => toggleActive(community._id, community.isActive)}
                      className="text-teal-600 hover:text-teal-900 mr-4"
                    >
                      {community.isActive ? "無効化" : "有効化"}
                    </button>
                    <a
                      href={`/dashboard/communities/${community._id}`}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      編集
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              公式コミュニティを作成
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  コミュニティ名 *
                </label>
                <input
                  type="text"
                  value={newCommunity.name}
                  onChange={(e) =>
                    setNewCommunity({ ...newCommunity, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="例: 同志社大学"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={newCommunity.description}
                  onChange={(e) =>
                    setNewCommunity({ ...newCommunity, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  rows={3}
                  placeholder="コミュニティの説明を入力"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  許可メールドメイン（カンマ区切り）
                </label>
                <input
                  type="text"
                  value={newCommunity.requiredEmailDomains}
                  onChange={(e) =>
                    setNewCommunity({
                      ...newCommunity,
                      requiredEmailDomains: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="例: doshisha.ac.jp, mail.doshisha.ac.jp"
                />
                <p className="text-xs text-gray-500 mt-1">
                  このドメインのメールアドレスを持つユーザーのみ参加可能
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大メンバー数
                </label>
                <input
                  type="number"
                  value={newCommunity.maxMembers}
                  onChange={(e) =>
                    setNewCommunity({ ...newCommunity, maxMembers: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  placeholder="無制限の場合は空欄"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {isCreating ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
