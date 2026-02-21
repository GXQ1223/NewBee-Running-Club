/**
 * Member Activities API functions
 * For tracking offline runs during the join process
 */

import { api } from './client';

/**
 * Get activities for a specific member
 * @param {number} memberId - Member ID
 * @returns {Promise<Array>} List of member activities
 */
export async function getMemberActivities(memberId) {
  return api.get(`/api/members/${memberId}/activities`);
}

/**
 * Submit an offline activity record
 * @param {number} memberId - Member ID
 * @param {Object} activityData - Activity data
 * @param {number} activityData.activity_number - 1 or 2
 * @param {string} activityData.event_name - Name of the event
 * @param {string} activityData.event_date - Date of the event
 * @param {string} activityData.description - Optional description
 * @param {string} activityData.proof_url - Optional proof URL
 * @returns {Promise<Object>} Created activity
 */
export async function submitActivity(memberId, activityData) {
  return api.post(`/api/members/${memberId}/activities`, activityData);
}

/**
 * Get all pending activities (committee or admin only)
 * @param {string} firebaseUid - Firebase UID of the admin/committee member
 * @returns {Promise<Array>} List of pending activities
 */
export async function getPendingActivities(firebaseUid) {
  return api.get('/api/activities/pending', {}, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Verify or reject an activity (committee or admin only)
 * @param {number} activityId - Activity ID
 * @param {boolean} approved - Whether to approve or reject
 * @param {string} rejectionReason - Reason for rejection (if not approved)
 * @param {string} firebaseUid - Firebase UID of the admin/committee member
 * @returns {Promise<Object>} Verification result
 */
export async function verifyActivity(activityId, approved, rejectionReason, firebaseUid) {
  return api.put(`/api/activities/${activityId}/verify`, {
    approved,
    rejection_reason: rejectionReason
  }, { 'X-Firebase-UID': firebaseUid });
}

