import { api } from './client';
import {
  getMemberActivities,
  submitActivity,
  getPendingActivities,
  verifyActivity,
} from './activities';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
});

test('getMemberActivities GETs the member activities endpoint', async () => {
  await expect(getMemberActivities(7)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/members/7/activities');
});

test('submitActivity POSTs activity data to the member activities endpoint', async () => {
  const activity = { activity_number: 1, event_name: 'Fun Run', event_date: '2026-01-01' };
  await expect(submitActivity(7, activity)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/members/7/activities', activity);
});

test('getPendingActivities GETs pending activities with admin UID header', async () => {
  await expect(getPendingActivities('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/activities/pending', {}, { 'X-Firebase-UID': 'uid-1' });
});

test('verifyActivity PUTs approval payload with admin UID header', async () => {
  await expect(verifyActivity(3, false, 'no proof', 'uid-1')).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith(
    '/api/activities/3/verify',
    { approved: false, rejection_reason: 'no proof' },
    { 'X-Firebase-UID': 'uid-1' }
  );
});
