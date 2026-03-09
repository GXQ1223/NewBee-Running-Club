/**
 * Training Tips API client
 * Handles all training tips related API calls
 */

import { api } from './client';

/**
 * Get all approved training tips (public)
 * @param {string} category - Optional category filter
 * @param {string} anonymousId - Anonymous user ID for tracking upvotes
 * @param {string} firebaseUid - Optional Firebase UID if logged in
 * @returns {Promise<Array>} - List of approved tips
 */
export const getApprovedTips = async (category = null, anonymousId = null, firebaseUid = null) => {
  const params = {};
  if (category) params.category = category;
  if (anonymousId) params.anonymous_id = anonymousId;

  const headers = {};
  if (firebaseUid) headers['X-Firebase-UID'] = firebaseUid;

  return api.get('/api/training-tips', params, headers);
};

/**
 * Get all training tips including pending/rejected (admin only)
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Array>} - List of all tips
 */
export const getAllTips = async (firebaseUid) => {
  return api.get('/api/training-tips/all', {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Submit a new training tip
 * @param {Object} tipData - Tip data
 * @param {string} firebaseUid - Optional Firebase UID if logged in
 * @returns {Promise<Object>} - Created tip
 */
export const submitTip = async (tipData, firebaseUid = null) => {
  const headers = {};
  if (firebaseUid) headers['X-Firebase-UID'] = firebaseUid;

  return api.post('/api/training-tips', tipData, headers);
};

/**
 * Update a training tip (admin only)
 * @param {number} tipId - Tip ID
 * @param {Object} tipData - Updated tip data
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Updated tip
 */
export const updateTip = async (tipId, tipData, firebaseUid) => {
  return api.put(`/api/training-tips/${tipId}`, tipData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Approve a pending tip (admin only)
 * @param {number} tipId - Tip ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Approval confirmation
 */
export const approveTip = async (tipId, firebaseUid) => {
  return api.put(`/api/training-tips/${tipId}/approve`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Reject a pending tip (admin only)
 * @param {number} tipId - Tip ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Rejection confirmation
 */
export const rejectTip = async (tipId, firebaseUid) => {
  return api.put(`/api/training-tips/${tipId}/reject`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a training tip (admin only)
 * @param {number} tipId - Tip ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteTip = async (tipId, firebaseUid) => {
  return api.delete(`/api/training-tips/${tipId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Toggle upvote on a training tip
 * @param {number} tipId - Tip ID
 * @param {string} anonymousId - Anonymous user ID (required if not logged in)
 * @param {string} firebaseUid - Optional Firebase UID if logged in
 * @returns {Promise<Object>} - Upvote response with new count
 */
export const toggleUpvote = async (tipId, anonymousId = null, firebaseUid = null) => {
  const params = {};
  if (anonymousId) params.anonymous_id = anonymousId;

  const headers = {};
  if (firebaseUid) headers['X-Firebase-UID'] = firebaseUid;

  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `/api/training-tips/${tipId}/upvote?${queryString}` : `/api/training-tips/${tipId}/upvote`;
  return api.post(url, {}, headers);
};
