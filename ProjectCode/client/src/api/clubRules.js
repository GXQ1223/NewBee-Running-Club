/**
 * Club Rules API client
 * Yearly Club Entry rule revisions, editable by committee/admin.
 */

import { api } from './client';

/**
 * Get all rule versions (current first, then newest year first)
 * @returns {Promise<Array>} - List of rule versions
 */
export const getClubRuleVersions = async () => {
  return api.get('/api/club-rules');
};

/**
 * Create a new rule version (committee/admin only)
 * @param {Object} versionData - { year_label, title, content, is_current }
 * @param {string} firebaseUid - Committee member's Firebase UID
 * @returns {Promise<Object>} - Created rule version
 */
export const createClubRuleVersion = async (versionData, firebaseUid) => {
  return api.post('/api/club-rules', versionData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Update a rule version (committee/admin only)
 * @param {number} versionId - Rule version ID
 * @param {Object} versionData - Fields to update
 * @param {string} firebaseUid - Committee member's Firebase UID
 * @returns {Promise<Object>} - Updated rule version
 */
export const updateClubRuleVersion = async (versionId, versionData, firebaseUid) => {
  return api.put(`/api/club-rules/${versionId}`, versionData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a rule version (committee/admin only)
 * @param {number} versionId - Rule version ID
 * @param {string} firebaseUid - Committee member's Firebase UID
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteClubRuleVersion = async (versionId, firebaseUid) => {
  return api.delete(`/api/club-rules/${versionId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};
