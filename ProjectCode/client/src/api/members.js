/**
 * Members API functions
 */

import { api } from './client';

/**
 * Sync a Firebase user to the members table
 * Creates a new member if not exists, returns existing member if already synced
 * @param {Object} userData - Firebase user data
 * @param {string} userData.firebase_uid - Firebase UID
 * @param {string} userData.email - User email
 * @param {string} [userData.display_name] - Display name
 * @param {string} [userData.photo_url] - Profile photo URL
 * @returns {Promise<Object>} Member data
 */
export async function syncFirebaseUser(userData) {
  return api.post('/api/members/firebase-sync', userData);
}

/**
 * Get member by Firebase UID
 * @param {string} firebaseUid - Firebase UID
 * @returns {Promise<Object>} Member data
 */
export async function getMemberByFirebaseUid(firebaseUid) {
  return api.get(`/api/members/firebase/${firebaseUid}`);
}

/**
 * Get current member's data
 * @param {number} memberId - Member ID
 * @returns {Promise<Object>} Member data
 */
export async function getMember(memberId) {
  return api.get(`/api/members/${memberId}`);
}

/**
 * Update member data
 * @param {number} memberId - Member ID
 * @param {Object} data - Updated fields
 * @returns {Promise<Object>} Updated member data
 */
export async function updateMember(memberId, data, firebaseUid = null) {
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.put(`/api/members/${memberId}`, data, headers);
}

/**
 * Update member privacy settings
 * @param {number} memberId - Member ID
 * @param {boolean} [showInCredits] - Show in credits page
 * @param {boolean} [showInDonors] - Show in donors page
 * @returns {Promise<Object>} Updated member data
 */
export async function updateMemberPrivacy(memberId, showInCredits, showInDonors) {
  const params = new URLSearchParams();
  if (showInCredits !== undefined) params.append('show_in_credits', showInCredits);
  if (showInDonors !== undefined) params.append('show_in_donors', showInDonors);
  return api.put(`/api/members/${memberId}/privacy?${params.toString()}`, {});
}

/**
 * Get all members visible in credits page
 * @returns {Promise<Array>} List of members
 */
export async function getMembersForCredits() {
  return api.get('/api/members/credits');
}

/**
 * Get committee members
 * @returns {Promise<Array>} List of committee members
 */
export async function getCommitteeMembers() {
  return api.get('/api/members/committee/list');
}

/**
 * Get all members (admin only)
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Array>} List of all members
 */
export async function getAllMembers(firebaseUid) {
  return api.get('/api/members', {}, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Submit join application
 * @param {Object} applicationData - Application form data
 * @param {string} applicationData.name - Full name
 * @param {string} applicationData.email - Email address
 * @param {string} [applicationData.nyrr_id] - NYRR Runner ID
 * @param {string} applicationData.running_experience - Running experience description
 * @param {string} applicationData.location - Running location
 * @param {string} applicationData.weekly_frequency - Weekly running frequency
 * @param {string} applicationData.monthly_mileage - Monthly mileage
 * @param {string} [applicationData.race_experience] - Race experience
 * @param {string} applicationData.goals - Running goals
 * @param {string} applicationData.introduction - Self introduction
 * @returns {Promise<Object>} Application response
 */
export async function submitJoinApplication(applicationData) {
  return api.post('/api/join/submit', applicationData);
}

/**
 * Submit existing member account request
 * Sends a notification to the committee for approval
 * @param {Object} data - Request data
 * @param {string} data.name - Member's name
 * @param {string} data.email - Member's email
 * @returns {Promise<Object>} Response
 */
export async function submitExistingMemberAccountRequest(data) {
  return api.post('/api/members/existing-member-account-request', data);
}

/**
 * Helper to create auth headers for admin endpoints
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Object} Headers object
 */
function getAdminHeaders(firebaseUid) {
  if (!firebaseUid) {
    throw new Error('Firebase UID is required for admin operations');
  }
  return { 'X-Firebase-UID': firebaseUid };
}

/**
 * Get all pending member applications (admin only)
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Array>} List of pending members
 */
export async function getPendingMembers(firebaseUid) {
  return api.get('/api/members/pending/list', {}, getAdminHeaders(firebaseUid));
}

/**
 * Approve a pending member application (admin only)
 * @param {number} memberId - Member ID to approve
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Approval response
 */
export async function approveMember(memberId, firebaseUid) {
  return api.put(`/api/members/${memberId}/approve`, {}, getAdminHeaders(firebaseUid));
}

/**
 * Reject a pending member application (admin only)
 * @param {number} memberId - Member ID to reject
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @param {string} rejectionReason - Reason for rejection (required)
 * @returns {Promise<Object>} Rejection response
 */
export async function rejectMember(memberId, firebaseUid, rejectionReason) {
  return api.put(`/api/members/${memberId}/reject`, { rejection_reason: rejectionReason }, getAdminHeaders(firebaseUid));
}

/**
 * Promote a runner to committee status (admin only)
 * @param {number} memberId - Member ID to promote
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Promotion response
 */
export async function promoteToCommittee(memberId, firebaseUid) {
  return api.put(`/api/members/${memberId}/promote-to-committee`, {}, getAdminHeaders(firebaseUid));
}

/**
 * Demote a committee member back to runner (admin only)
 * @param {number} memberId - Member ID to demote
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Demotion response
 */
export async function demoteFromCommittee(memberId, firebaseUid) {
  return api.put(`/api/members/${memberId}/demote-from-committee`, {}, getAdminHeaders(firebaseUid));
}

