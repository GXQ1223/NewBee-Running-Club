/**
 * API functions for club credits management
 */

import { api } from './client';

/**
 * Get all credits, optionally filtered by type
 * @param {string} creditType - Optional: 'total', 'activity', 'registration', 'volunteer'
 * @returns {Promise<Array>}
 */
export const getCredits = async (creditType = null) => {
  const params = creditType ? { credit_type: creditType } : {};
  return api.get('/api/credits', params);
};

/**
 * Get a specific credit by ID
 * @param {number} creditId
 * @returns {Promise<Object>}
 */
export const getCreditById = async (creditId) => {
  return api.get(`/api/credits/${creditId}`);
};

/**
 * Create a new credit entry (admin only)
 * @param {Object} creditData
 * @param {string} firebaseUid - Firebase UID for authentication
 * @returns {Promise<Object>}
 */
export const createCredit = async (creditData, firebaseUid) => {
  return api.post('/api/credits', creditData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Update a credit entry (admin only)
 * @param {number} creditId
 * @param {Object} creditData
 * @param {string} firebaseUid - Firebase UID for authentication
 * @returns {Promise<Object>}
 */
export const updateCredit = async (creditId, creditData, firebaseUid) => {
  return api.put(`/api/credits/${creditId}`, creditData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a credit entry (admin only)
 * @param {number} creditId
 * @param {string} firebaseUid - Firebase UID for authentication
 * @returns {Promise<Object>}
 */
export const deleteCredit = async (creditId, firebaseUid) => {
  return api.delete(`/api/credits/${creditId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Bulk upload credits from CSV file (admin only)
 * @param {File} file - CSV file with columns: fullName, registration_sum, checkin_sum
 * @param {string} creditType - 'activity', 'registration', or 'volunteer' (NOT 'total')
 * @param {string} mode - 'replace' (delete all existing) or 'merge' (update/add)
 * @param {string} firebaseUid - Firebase UID for authentication
 * @returns {Promise<Object>} - Upload result with counts
 */
export const bulkUploadCredits = async (file, creditType, mode, firebaseUid) => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('credit_type', creditType);
  formData.append('mode', mode);

  const response = await fetch(`${API_BASE_URL}/api/credits/bulk-upload`, {
    method: 'POST',
    headers: {
      'X-Firebase-UID': firebaseUid,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Upload failed with status ${response.status}`);
  }

  return response.json();
};
