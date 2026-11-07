/**
 * Heylo Sync API functions
 */

import { api } from './client';

/**
 * Fetch the club's Heylo group server-side and sync its activities
 * into website events (committee/admin only).
 * @param {string} firebaseUid - The current user's Firebase UID
 * @returns {Promise<Object>} { created, updated, unchanged, results, changes }
 *   where changes lists { name, date, action } for created/updated activities
 */
export async function syncHeyloNow(firebaseUid) {
  return api.post('/api/heylo/sync-now', {}, { 'X-Firebase-UID': firebaseUid });
}

/**
 * List the website events that came from Heylo (for pre-sync diffing).
 * @returns {Promise<Array>} Synced Heylo events
 */
export async function getSyncedHeyloEvents() {
  return api.get('/api/heylo/synced', {}, {}, { skipCache: true });
}
