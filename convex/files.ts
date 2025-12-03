import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * 画像アップロード用のURLを生成
 */
export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

/**
 * 保存された画像のURLを取得
 */
export const getImageUrl = query({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
