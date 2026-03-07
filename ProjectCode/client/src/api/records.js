/**
 * Records API functions
 */

import { api } from './client';

/**
 * Get available years for race records
 * @returns {Promise<{years: number[]}>}
 */
export async function getAvailableYears() {
  return api.get('/api/results/available-years');
}

/**
 * Get men's race records
 * @param {number|null} year - Optional year filter
 * @returns {Promise<{men_records: Array}>}
 */
export async function getMenRecords(year = null) {
  const params = year ? { year } : {};
  return api.get('/api/results/men-records', params);
}

/**
 * Get women's race records
 * @param {number|null} year - Optional year filter
 * @returns {Promise<{women_records: Array}>}
 */
export async function getWomenRecords(year = null) {
  const params = year ? { year } : {};
  return api.get('/api/results/women-records', params);
}

/**
 * Get all race names
 * @returns {Promise<{races: string[]}>}
 */
export async function getAllRaces() {
  return api.get('/api/results/all-races');
}

/**
 * Get available NYRR race patterns for syncing
 * @returns {Promise<{races: Array<{code, name_template, distance, typical_month}>}>}
 */
export async function getSyncRacePatterns() {
  return api.get('/api/results/sync/races');
}

/**
 * Start NYRR data sync via SSE streaming
 * @param {{years: number[], race_codes: string[]|null}} params
 * @param {string} firebaseUid
 * @param {function} onProgress - Called with each SSE event object
 * @returns {Promise<void>}
 */
export async function startNyrrSync(params, firebaseUid, onProgress) {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
  const response = await fetch(`${API_BASE_URL}/api/results/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-UID': firebaseUid,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Sync failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onProgress(event);
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
