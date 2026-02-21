/**
 * Homepage Sections API client
 * Handles all section-related API calls for homepage management
 */

import { api, clearApiCache } from './client';

/**
 * Get all active sections (public)
 * @returns {Promise<Array>} - List of active sections sorted by display order
 */
export const getActiveSections = async () => {
  return api.get('/api/homepage-sections');
};

/**
 * Get all sections including inactive (admin only)
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Array>} - List of all sections
 */
export const getAllSections = async (firebaseUid) => {
  return api.get('/api/homepage-sections/all', {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Get a single section by ID
 * @param {number} sectionId - Section ID
 * @returns {Promise<Object>} - Section data
 */
export const getSectionById = async (sectionId) => {
  return api.get(`/api/homepage-sections/${sectionId}`);
};

/**
 * Create a new section (admin only)
 * @param {Object} sectionData - Section data
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Created section
 */
export const createSection = async (sectionData, firebaseUid) => {
  return api.post('/api/homepage-sections', sectionData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Update an existing section (admin only)
 * @param {number} sectionId - Section ID
 * @param {Object} sectionData - Updated section data
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Updated section
 */
export const updateSection = async (sectionId, sectionData, firebaseUid) => {
  return api.put(`/api/homepage-sections/${sectionId}`, sectionData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a section (admin only)
 * @param {number} sectionId - Section ID
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteSection = async (sectionId, firebaseUid) => {
  return api.delete(`/api/homepage-sections/${sectionId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Reorder sections (admin only)
 * @param {Array<number>} sectionIds - Array of section IDs in desired order
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Confirmation message
 */
export const reorderSections = async (sectionIds, firebaseUid) => {
  return api.put('/api/homepage-sections/reorder', { section_ids: sectionIds }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Upload an image file (admin only)
 * @param {File} file - Image file to upload
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Object containing the uploaded image URL
 */
export const uploadImage = async (file, firebaseUid) => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
    method: 'POST',
    headers: {
      'X-Firebase-UID': firebaseUid,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to upload image');
  }

  const result = await response.json();
  clearApiCache('/api/homepage-sections');
  return result;
};
