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
 * @param {string} [firebaseUid] - Committee/admin Firebase UID
 * @returns {Promise<Object>} Created donor
 */
export async function createDonor(donorData, firebaseUid) {
  return api.post(
    '/api/donors',
    donorData,
    firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {}
  );
}

/**
 * Update a donor
 * @param {string} donorId - Donor ID
 * @param {Object} donorData - Updated donor data
 * @param {string} [firebaseUid] - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated donor
 */
export async function updateDonor(donorId, donorData, firebaseUid) {
  return api.put(
    `/api/donors/${donorId}`,
    donorData,
    firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {}
  );
}

/**
 * Delete a donor
 * @param {string} donorId - Donor ID
 * @param {string} [firebaseUid] - Committee/admin Firebase UID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDonor(donorId, firebaseUid) {
  return api.delete(
    `/api/donors/${donorId}`,
    firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {}
  );
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
 * Send a donation back to pending review (undo an accidental approve/dismiss)
 * @param {number} donationId - Donation ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated ledger entry
 */
export async function revertDonation(donationId, firebaseUid) {
  return api.post(`/api/donors/donations/${donationId}/revert`, {}, {
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
 * Email the donor a thank-you letter and stamp the donation as thanked.
 * Payment emails carry no donor address, so the committee provides one.
 * @param {number} donationId - Donation ID
 * @param {Object} payload - { email, subject, message, attachReceipt }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated ledger entry
 */
export async function sendThankYou(donationId, { email, subject, message, attachReceipt }, firebaseUid) {
  return api.post(`/api/donors/donations/${donationId}/send-thank-you`, {
    email,
    subject,
    message,
    attach_receipt: Boolean(attachReceipt),
  }, {
    'X-Firebase-UID': firebaseUid,
  });
}

/**
 * Mark a donation as already thanked (e.g. a card mailed or a call made
 * outside the app) without sending an email. Just stamps thank_you_sent_at.
 * @param {number} donationId - Donation ID
 * @param {string} [note] - Optional note for the audit trail
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated ledger entry
 */
export async function markThankYouSent(donationId, note, firebaseUid) {
  return api.post(`/api/donors/donations/${donationId}/mark-thank-you-sent`, {
    note: note || undefined,
  }, {
    'X-Firebase-UID': firebaseUid,
  });
}

/**
 * The rendered letter for a donation, for review/editing in the send dialog.
 * Auto-matches a template by amount; pass templateId to render a specific
 * one (0 = built-in default).
 * @param {number} donationId - Donation ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @param {number} [templateId] - Specific template to render
 * @returns {Promise<Object>} { subject, body, template_name, template_id }
 */
export async function getThankYouPreview(donationId, firebaseUid, templateId) {
  const params = templateId === undefined ? {} : { template_id: templateId };
  return api.get(`/api/donors/donations/${donationId}/thank-you-preview`, params,
    { 'X-Firebase-UID': firebaseUid }, { skipCache: true });
}

/**
 * List thank-you templates (lowest tier first)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Array>} Templates
 */
export async function getThankYouTemplates(firebaseUid) {
  return api.get('/api/donors/thank-you-templates', {},
    { 'X-Firebase-UID': firebaseUid }, { skipCache: true });
}

/**
 * Create a thank-you template
 * @param {Object} data - { name, min_amount, subject, body }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 */
export async function createThankYouTemplate(data, firebaseUid) {
  return api.post('/api/donors/thank-you-templates', data, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Update a thank-you template
 * @param {number} templateId - Template ID
 * @param {Object} data - Fields to update
 * @param {string} firebaseUid - Committee/admin Firebase UID
 */
export async function updateThankYouTemplate(templateId, data, firebaseUid) {
  return api.put(`/api/donors/thank-you-templates/${templateId}`, data, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Delete a thank-you template
 * @param {number} templateId - Template ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 */
export async function deleteThankYouTemplate(templateId, firebaseUid) {
  return api.delete(`/api/donors/thank-you-templates/${templateId}`, { 'X-Firebase-UID': firebaseUid });
}

/**
 * Download the official donation receipt PDF (confirmed donations only).
 * Raw fetch because the response is a file, not JSON.
 * @param {number} donationId - Donation ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function downloadReceipt(donationId, firebaseUid) {
  const response = await fetch(`${API_BASE_URL}/api/donors/donations/${donationId}/receipt`, {
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
  const filename = match ? match[1] : `NewBee_Donation_Receipt_${donationId}.pdf`;
  const blob = await response.blob();
  return { blob, filename };
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
