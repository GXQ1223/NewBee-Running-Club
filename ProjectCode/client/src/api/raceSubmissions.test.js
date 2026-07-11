import { api } from './client';
import {
  createRaceSubmission,
  getMyRaceSubmissions,
  updateRaceSubmission,
  deleteRaceSubmission,
  getPendingRaceSubmissions,
  reviewRaceSubmission,
  upsertRacePhoto,
  getMyRacePhotos,
} from './raceSubmissions';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'uid-1';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('createRaceSubmission POSTs the submission with auth header', async () => {
  const data = { race_name: 'Boston Marathon', race_date: '2026-04-20', race_distance: 'Marathon', finish_time: '3:25:58' };
  await expect(createRaceSubmission(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/race-submissions', data, AUTH);
});

test('getMyRaceSubmissions GETs own submissions uncached', async () => {
  await expect(getMyRaceSubmissions(UID)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/race-submissions/mine', {}, AUTH, { skipCache: true });
});

test('updateRaceSubmission PUTs changes to the submission', async () => {
  await expect(updateRaceSubmission(5, { finish_time: '3:20:00' }, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/race-submissions/5', { finish_time: '3:20:00' }, AUTH);
});

test('deleteRaceSubmission DELETEs the submission', async () => {
  await expect(deleteRaceSubmission(5, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/race-submissions/5', AUTH);
});

test('getPendingRaceSubmissions GETs the committee review list uncached', async () => {
  await expect(getPendingRaceSubmissions(UID)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/race-submissions/pending', {}, AUTH, { skipCache: true });
});

test('reviewRaceSubmission PUTs the decision with note', async () => {
  await expect(reviewRaceSubmission(5, false, 'link broken', UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith(
    '/api/race-submissions/5/review',
    { approved: false, review_note: 'link broken' },
    AUTH
  );
});

test('reviewRaceSubmission sends null note when omitted', async () => {
  await reviewRaceSubmission(5, true, undefined, UID);
  expect(api.put).toHaveBeenCalledWith(
    '/api/race-submissions/5/review',
    { approved: true, review_note: null },
    AUTH
  );
});

test('upsertRacePhoto PUTs the photo for a result', async () => {
  await expect(upsertRacePhoto(9, 'https://img/x.jpg', UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/race-photos', { result_id: 9, photo_url: 'https://img/x.jpg' }, AUTH);
});

test('getMyRacePhotos GETs own race photos uncached', async () => {
  await expect(getMyRacePhotos(UID)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/race-photos/mine', {}, AUTH, { skipCache: true });
});

test('all helpers reject without a firebase uid', async () => {
  await expect(createRaceSubmission({}, null)).rejects.toThrow('Firebase UID is required');
  await expect(getMyRaceSubmissions()).rejects.toThrow('Firebase UID is required');
  await expect(updateRaceSubmission(1, {}, '')).rejects.toThrow('Firebase UID is required');
  await expect(deleteRaceSubmission(1, undefined)).rejects.toThrow('Firebase UID is required');
  await expect(getPendingRaceSubmissions(null)).rejects.toThrow('Firebase UID is required');
  await expect(reviewRaceSubmission(1, true, null, null)).rejects.toThrow('Firebase UID is required');
  await expect(upsertRacePhoto(1, 'x', null)).rejects.toThrow('Firebase UID is required');
  await expect(getMyRacePhotos(null)).rejects.toThrow('Firebase UID is required');
});
