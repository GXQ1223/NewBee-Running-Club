/**
 * Donors API functions
 */

import { api } from './client';

/**
 * Get all donors (individual and enterprise)
 * @returns {Promise<Object>} Object with individual_donors and enterprise_donors arrays
 */
export async function getAllDonors() {
  return api.get('/api/donors');
}

/**
 * Get donors by type
 * @param {string} donorType - 'individual' or 'enterprise'
 * @returns {Promise<Array>} List of donors
 */
export async function getDonorsByType(donorType) {
  return api.get(`/api/donors/${donorType}`);
}

/**
 * Get a specific donor by donor_id
 * @param {string} donorId - Donor ID
 * @returns {Promise<Object>} Donor data
 */
export async function getDonorById(donorId) {
  return api.get(`/api/donors/id/${donorId}`);
}

/**
 * Create a new donor
 * @param {Object} donorData - Donor data
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Created donor
 */
export async function createDonor(donorData, firebaseUid) {
  return api.post('/api/donors', donorData, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Update a donor
 * @param {string} donorId - Donor ID
 * @param {Object} donorData - Updated donor data
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Updated donor
 */
export async function updateDonor(donorId, donorData, firebaseUid) {
  return api.put(`/api/donors/${donorId}`, donorData, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Delete a donor
 * @param {string} donorId - Donor ID
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDonor(donorId, firebaseUid) {
  return api.delete(`/api/donors/${donorId}`, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Get donation statistics summary
 * @returns {Promise<Array>} Donation summary by type
 */
export async function getDonationSummary() {
  return api.get('/api/donors/stats/summary');
}

/**
 * Get public donors with privacy rules applied
 * - Individual donors: amount hidden, date shown
 * - Enterprise donors: amount shown
 * - Respects linked member's show_in_donors setting
 * @returns {Promise<Array>} List of public donor data
 */
export async function getPublicDonors() {
  return api.get('/api/donors/public');
}

/**
 * Get whether donation amounts are hidden globally
 * @returns {Promise<Object>} { hide_amounts: boolean }
 */
export async function getHideAmounts() {
  return api.get('/api/donors/hide-amounts');
}

/**
 * Toggle global hide donation amounts setting (admin only)
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} { hide_amounts: boolean }
 */
export async function toggleHideAmounts(firebaseUid) {
  return api.put('/api/donors/hide-amounts', undefined, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Link a donor to a member account (admin only)
 * @param {string} donorId - Donor ID
 * @param {number} memberId - Member ID to link
 * @param {string} firebaseUid - Firebase UID of the admin user
 * @returns {Promise<Object>} Link result
 */
export async function linkDonorToMember(donorId, memberId, firebaseUid) {
  return api.put(`/api/donors/${donorId}/link-member`, { member_id: memberId }, { 'X-Firebase-UID': firebaseUid });
}
