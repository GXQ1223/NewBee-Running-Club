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
 * @returns {Promise<Object>} Created donor
 */
export async function createDonor(donorData) {
  return api.post('/api/donors', donorData);
}

/**
 * Update a donor
 * @param {string} donorId - Donor ID
 * @param {Object} donorData - Updated donor data
 * @returns {Promise<Object>} Updated donor
 */
export async function updateDonor(donorId, donorData) {
  return api.put(`/api/donors/${donorId}`, donorData);
}

/**
 * Delete a donor
 * @param {string} donorId - Donor ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDonor(donorId) {
  return api.delete(`/api/donors/${donorId}`);
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
 * @returns {Promise<Object>} { hide_amounts: boolean }
 */
export async function toggleHideAmounts() {
  return api.put('/api/donors/hide-amounts');
}

/**
 * Link a donor to a member account (admin only)
 * @param {string} donorId - Donor ID
 * @param {number} memberId - Member ID to link
 * @returns {Promise<Object>} Link result
 */
export async function linkDonorToMember(donorId, memberId) {
  return api.put(`/api/donors/${donorId}/link-member`, { member_id: memberId });
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

/**
 * Get the full donation ledger with stats and Gmail sync status (committee/admin only)
 * @param {string} firebaseUid - Committee/admin Firebase UID for authentication
 * @returns {Promise<Object>} { donations, stats, sync }
 */
export async function getDonationLedger(firebaseUid) {
  return api.get('/api/donors/ledger', {}, { 'X-Firebase-UID': firebaseUid }, { skipCache: true });
}

/**
 * Approve a pending Gmail-imported donation so it appears publicly
 * @param {number} donationId - Donation ID
 * @param {Object} corrections - Optional { donor_type, name, hide_name }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated ledger entry
 */
export async function approveDonation(donationId, corrections = {}, firebaseUid) {
  return api.post(`/api/donors/donations/${donationId}/approve`, corrections, {
    'X-Firebase-UID': firebaseUid,
  });
}

/**
 * Dismiss a pending donation (never shown publicly)
 * @param {number} donationId - Donation ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated ledger entry
 */
export async function dismissDonation(donationId, firebaseUid) {
  return api.post(`/api/donors/donations/${donationId}/dismiss`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
}

/**
 * Trigger the Gmail Zelle donation sync now (committee/admin only)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Sync statistics
 */
export async function runGmailSync(firebaseUid) {
  return api.post('/api/donors/sync-gmail', {}, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Download a tax report for a date range (committee/admin only).
 * Uses a raw fetch because the response is a file, not JSON.
 * @param {Object} params - { startDate, endDate, format } (dates as YYYY-MM-DD, format 'csv'|'pdf')
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function downloadTaxReport({ startDate, endDate, format }, firebaseUid) {
  const query = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    format,
  }).toString();
  const response = await fetch(`${API_BASE_URL}/api/donors/tax-report?${query}`, {
    headers: { 'X-Firebase-UID': firebaseUid },
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      detail = data?.detail || detail;
    } catch {
      // Response body is not JSON
    }
    throw new Error(detail);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : `newbee-donations-${startDate}-to-${endDate}.${format}`;
  const blob = await response.blob();
  return { blob, filename };
}
