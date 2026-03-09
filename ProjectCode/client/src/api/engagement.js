/**
 * Engagement API client
 * Handles all engagement-related API calls (likes, reactions, comments)
 */

import { api } from './client';

// Available reaction emojis
export const ALLOWED_EMOJIS = ['🏃', '🎉', '💪', '👏', '❤️', '🔥', '🐝', '⭐'];

// Anonymous ID management for non-logged-in users
const ANONYMOUS_ID_KEY = 'newbee_anonymous_id';

export const getAnonymousId = () => {
  let anonymousId = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (!anonymousId) {
    anonymousId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
  }
  return anonymousId;
};

// COMMENT ENDPOINTS

/**
 * Get visible comments for an event
 * @param {number} eventId - Event ID
 * @returns {Promise<Array>} - List of comments
 */
export const getEventComments = async (eventId) => {
  return api.get(`/api/events/${eventId}/comments`);
};

/**
 * Get all comments including hidden (admin only)
 * @param {number} eventId - Event ID
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Array>} - List of all comments with moderation info
 */
export const getAllEventComments = async (eventId, firebaseUid) => {
  return api.get(`/api/events/${eventId}/comments/all`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Create a new comment (requires login)
 * @param {number} eventId - Event ID
 * @param {string} content - Comment content
 * @param {string} firebaseUid - User's Firebase UID
 * @returns {Promise<Object>} - Created comment
 */
export const createComment = async (eventId, content, firebaseUid) => {
  return api.post(`/api/events/${eventId}/comments`, { content }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a comment
 * @param {number} commentId - Comment ID
 * @param {string} firebaseUid - User's Firebase UID
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteComment = async (commentId, firebaseUid) => {
  return api.delete(`/api/comments/${commentId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Toggle comment highlight (admin only)
 * @param {number} commentId - Comment ID
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Result with highlight status
 */
export const toggleCommentHighlight = async (commentId, firebaseUid) => {
  return api.put(`/api/comments/${commentId}/highlight`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Hide a comment (admin only)
 * @param {number} commentId - Comment ID
 * @param {string} reason - Hide reason
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Result
 */
export const hideComment = async (commentId, reason, firebaseUid) => {
  return api.put(`/api/comments/${commentId}/hide`, { reason }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Unhide a comment (admin only)
 * @param {number} commentId - Comment ID
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Result
 */
export const unhideComment = async (commentId, firebaseUid) => {
  return api.put(`/api/comments/${commentId}/unhide`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

// LIKE ENDPOINTS

/**
 * Get like count for an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID for logged-in check
 * @returns {Promise<Object>} - Like count and user_liked status
 */
export const getEventLikes = async (eventId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.get(`/api/events/${eventId}/likes`, params, headers);
};

/**
 * Toggle like on an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID for logged-in users
 * @returns {Promise<Object>} - Updated like count and user_liked status
 */
export const toggleLike = async (eventId, firebaseUid = null) => {
  const body = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.post(`/api/events/${eventId}/likes`, body, headers);
};

/**
 * Remove like from an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Result
 */
export const removeLike = async (eventId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.delete(`/api/events/${eventId}/likes?${new URLSearchParams(params)}`, headers);
};

// REACTION ENDPOINTS

/**
 * Get reaction counts for an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Reactions with counts
 */
export const getEventReactions = async (eventId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.get(`/api/events/${eventId}/reactions`, params, headers);
};

/**
 * Toggle a reaction on an event
 * @param {number} eventId - Event ID
 * @param {string} emoji - Emoji to react with
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Updated reactions
 */
export const toggleReaction = async (eventId, emoji, firebaseUid = null) => {
  const body = firebaseUid ? { emoji } : { emoji, anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.post(`/api/events/${eventId}/reactions`, body, headers);
};

/**
 * Remove a specific reaction
 * @param {number} eventId - Event ID
 * @param {string} emoji - Emoji to remove
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Result
 */
export const removeReaction = async (eventId, emoji, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.delete(`/api/events/${eventId}/reactions/${encodeURIComponent(emoji)}?${new URLSearchParams(params)}`, headers);
};

// AGGREGATED ENGAGEMENT ENDPOINTS

/**
 * Get all engagement data for an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Full engagement data
 */
export const getEventEngagement = async (eventId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.get(`/api/events/${eventId}/engagement`, params, headers);
};

/**
 * Get engagement data for multiple events (batch)
 * @param {Array<number>} eventIds - Event IDs
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Engagements map
 */
export const getBatchEngagement = async (eventIds, firebaseUid = null) => {
  const body = firebaseUid
    ? { event_ids: eventIds }
    : { event_ids: eventIds, anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.post('/api/events/engagement/batch', body, headers);
};

// EVENT SETTINGS ENDPOINTS

/**
 * Get event engagement settings
 * @param {number} eventId - Event ID
 * @returns {Promise<Object>} - Settings
 */
export const getEventSettings = async (eventId) => {
  return api.get(`/api/events/${eventId}/settings`);
};

/**
 * Update event engagement settings (admin only)
 * @param {number} eventId - Event ID
 * @param {Object} settings - Settings to update
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Updated settings
 */
export const updateEventSettings = async (eventId, settings, firebaseUid) => {
  return api.put(`/api/events/${eventId}/settings`, settings, {
    'X-Firebase-UID': firebaseUid,
  });
};
