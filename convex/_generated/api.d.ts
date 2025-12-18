/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as communities from "../communities.js";
import type * as communityEvents from "../communityEvents.js";
import type * as communityInvites from "../communityInvites.js";
import type * as communityJoinRequests from "../communityJoinRequests.js";
import type * as communityMedia from "../communityMedia.js";
import type * as communityMemberships from "../communityMemberships.js";
import type * as crons from "../crons.js";
import type * as crons_resetDailySessions from "../crons/resetDailySessions.js";
import type * as email from "../email.js";
import type * as emailVerifications from "../emailVerifications.js";
import type * as files from "../files.js";
import type * as friends from "../friends.js";
import type * as games from "../games.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as matching from "../matching.js";
import type * as migrations_removePhotosField from "../migrations/removePhotosField.js";
import type * as notifications from "../notifications.js";
import type * as officialCommunities from "../officialCommunities.js";
import type * as profiles from "../profiles.js";
import type * as stamps from "../stamps.js";
import type * as topics from "../topics.js";
import type * as users from "../users.js";
import type * as utils_dateUtils from "../utils/dateUtils.js";
import type * as validation from "../validation.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  auth: typeof auth;
  chat: typeof chat;
  communities: typeof communities;
  communityEvents: typeof communityEvents;
  communityInvites: typeof communityInvites;
  communityJoinRequests: typeof communityJoinRequests;
  communityMedia: typeof communityMedia;
  communityMemberships: typeof communityMemberships;
  crons: typeof crons;
  "crons/resetDailySessions": typeof crons_resetDailySessions;
  email: typeof email;
  emailVerifications: typeof emailVerifications;
  files: typeof files;
  friends: typeof friends;
  games: typeof games;
  history: typeof history;
  http: typeof http;
  matching: typeof matching;
  "migrations/removePhotosField": typeof migrations_removePhotosField;
  notifications: typeof notifications;
  officialCommunities: typeof officialCommunities;
  profiles: typeof profiles;
  stamps: typeof stamps;
  topics: typeof topics;
  users: typeof users;
  "utils/dateUtils": typeof utils_dateUtils;
  validation: typeof validation;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
