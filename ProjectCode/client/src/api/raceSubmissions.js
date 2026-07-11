/**
 * Race record submissions & race photos API functions
 *
 * Members submit PRs from non-NYRR races (creating the race entry with an
 * official-results link + photo). Committee reviews; approved records are
 * posted to the results table → profile + club leaderboard.
 */

import { api } from './client';

function authHeaders(firebaseUid) {
  if (!firebaseUid) {
    throw new Error('Firebase UID is required');
  }
  return { 'X-Firebase-UID': firebaseUid };
}

/**
 * Submit a race record for committee review
 * @param {Object} data - {race_name, race_date, race_distance, finish_time, proof_url?, photo_url?}
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Object>} Created submission
 */
export async function createRaceSubmission(data, firebaseUid) {
  return api.post('/api/race-submissions', data, authHeaders(firebaseUid));
}

/**
 * Get all of the current member's submissions (any status), newest first
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Array>} Submissions
 */
export async function getMyRaceSubmissions(firebaseUid) {
  return api.get('/api/race-submissions/mine', {}, authHeaders(firebaseUid), { skipCache: true });
}

/**
 * Edit own submission (record fields while pending/rejected; photo anytime)
 * @param {number} submissionId - Submission ID
 * @param {Object} data - Fields to update
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Object>} Updated submission
 */
export async function updateRaceSubmission(submissionId, data, firebaseUid) {
  return api.put(`/api/race-submissions/${submissionId}`, data, authHeaders(firebaseUid));
}

/**
 * Withdraw own pending/rejected submission
 * @param {number} submissionId - Submission ID
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Object>} Message
 */
export async function deleteRaceSubmission(submissionId, firebaseUid) {
  return api.delete(`/api/race-submissions/${submissionId}`, authHeaders(firebaseUid));
}

/**
 * Get pending submissions with member info (committee/admin)
 * @param {string} firebaseUid - Committee member's Firebase UID
 * @returns {Promise<Array>} Pending submissions
 */
export async function getPendingRaceSubmissions(firebaseUid) {
  return api.get('/api/race-submissions/pending', {}, authHeaders(firebaseUid), { skipCache: true });
}

/**
 * Approve or reject a submission (committee/admin)
 * @param {number} submissionId - Submission ID
 * @param {boolean} approved - Decision
 * @param {string} reviewNote - Note (required when rejecting)
 * @param {string} firebaseUid - Committee member's Firebase UID
 * @returns {Promise<Object>} Updated submission
 */
export async function reviewRaceSubmission(submissionId, approved, reviewNote, firebaseUid) {
  return api.put(
    `/api/race-submissions/${submissionId}/review`,
    { approved, review_note: reviewNote || null },
    authHeaders(firebaseUid)
  );
}

/**
 * Attach or replace the member's photo on one of their synced race results
 * @param {number} resultId - Results-table row ID
 * @param {string} photoUrl - Uploaded photo URL
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Object>} Race photo record
 */
export async function upsertRacePhoto(resultId, photoUrl, firebaseUid) {
  return api.put('/api/race-photos', { result_id: resultId, photo_url: photoUrl }, authHeaders(firebaseUid));
}

/**
 * Get the current member's race photos (keyed by result_id)
 * @param {string} firebaseUid - Current user's Firebase UID
 * @returns {Promise<Array>} Race photos
 */
export async function getMyRacePhotos(firebaseUid) {
  return api.get('/api/race-photos/mine', {}, authHeaders(firebaseUid), { skipCache: true });
}
