import { internalMutation } from "../_generated/server";

/**
 * プロフィールからphotosフィールドを削除するマイグレーション
 */
export const removePhotosField = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();

    let updatedCount = 0;

    for (const profile of profiles) {
      // @ts-ignore - photosフィールドを削除
      if ('photos' in profile) {
        await ctx.db.patch(profile._id, {
          // @ts-ignore
          photos: undefined,
        });
        updatedCount++;
      }
    }

    return { updatedCount, totalProfiles: profiles.length };
  },
});
