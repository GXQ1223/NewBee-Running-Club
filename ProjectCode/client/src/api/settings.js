/**
 * Settings API client
 * Handles all site settings API calls including social links
 */

import { api } from './client';

/**
 * Get social media links (public)
 * @returns {Promise<Object>} - Social links object with instagram, xiaohongshu, heylo, shop
 */
export const getSocialLinks = async () => {
  return api.get('/api/settings/social-links');
};

/**
 * Get all site settings (admin/committee only)
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Array>} - List of all settings
 */
export const getAllSettings = async (firebaseUid) => {
  return api.get('/api/settings', {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Get settings by category (admin/committee only)
 * @param {string} category - Category name (e.g., 'social')
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Array>} - List of settings in the category
 */
export const getSettingsByCategory = async (category, firebaseUid) => {
  return api.get(`/api/settings/category/${category}`, {}, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Update a setting by key (admin/committee only)
 * @param {string} key - Setting key (e.g., 'social_instagram')
 * @param {Object} settingData - Updated setting data { value, label_en, label_cn, is_active }
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Updated setting
 */
export const updateSetting = async (key, settingData, firebaseUid) => {
  return api.put(`/api/settings/${key}`, settingData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Create a new setting (admin only)
 * @param {Object} settingData - Setting data { key, value, label_en, label_cn, category, is_active }
 * @param {string} firebaseUid - Admin's Firebase UID for authentication
 * @returns {Promise<Object>} - Created setting
 */
export const createSetting = async (settingData, firebaseUid) => {
  return api.post('/api/settings', settingData, {
    'X-Firebase-UID': firebaseUid,
  });
};
