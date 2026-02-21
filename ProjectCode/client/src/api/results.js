/**
 * Race Results API functions
 */

import { api } from './client';

/**
 * Get race results for a member by NYRR ID or name
 * @param {string} searchKey - Member's NYRR ID or display name
 * @param {Object} [options] - Optional parameters for more precise matching
 * @param {string} [options.gender] - "M" or "F" for gender_age matching
 * @param {number} [options.birth_year] - Birth year for gender_age calculation
 * @returns {Promise<Object>} Race results and statistics
 */
export async function getMemberRaceResults(searchKey, options = {}) {
  const params = {};
  if (options.gender) params.gender = options.gender;
  if (options.birth_year) params.birth_year = options.birth_year;
  return api.get(`/api/results/member/${encodeURIComponent(searchKey)}`, params);
}

