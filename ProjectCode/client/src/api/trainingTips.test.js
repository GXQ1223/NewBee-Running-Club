import { api } from './client';
import {
  getApprovedTips,
  getAllTips,
  submitTip,
  updateTip,
  approveTip,
  rejectTip,
  deleteTip,
  toggleUpvote,
} from './trainingTips';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'user-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('getApprovedTips GETs with no params or headers by default', async () => {
  await expect(getApprovedTips()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/training-tips', {}, {});
});

test('getApprovedTips includes category, anonymous id, and UID header when provided', async () => {
  await getApprovedTips('nutrition', 'anon_1', UID);
  expect(api.get).toHaveBeenCalledWith(
    '/api/training-tips',
    { category: 'nutrition', anonymous_id: 'anon_1' },
    AUTH
  );
});

test('getAllTips GETs all tips with admin header', async () => {
  await getAllTips(UID);
  expect(api.get).toHaveBeenCalledWith('/api/training-tips/all', {}, AUTH);
});

test('submitTip POSTs tip data anonymously by default', async () => {
  const tip = { title: 'Hydrate' };
  await submitTip(tip);
  expect(api.post).toHaveBeenCalledWith('/api/training-tips', tip, {});
});

test('submitTip attaches UID header when logged in', async () => {
  const tip = { title: 'Hydrate' };
  await submitTip(tip, UID);
  expect(api.post).toHaveBeenCalledWith('/api/training-tips', tip, AUTH);
});

test('updateTip PUTs tip data with admin header', async () => {
  await updateTip(4, { title: 'Rest' }, UID);
  expect(api.put).toHaveBeenCalledWith('/api/training-tips/4', { title: 'Rest' }, AUTH);
});

test('approveTip PUTs the approve endpoint', async () => {
  await approveTip(4, UID);
  expect(api.put).toHaveBeenCalledWith('/api/training-tips/4/approve', {}, AUTH);
});

test('rejectTip PUTs the reject endpoint', async () => {
  await rejectTip(4, UID);
  expect(api.put).toHaveBeenCalledWith('/api/training-tips/4/reject', {}, AUTH);
});

test('deleteTip DELETEs the tip with admin header', async () => {
  await deleteTip(4, UID);
  expect(api.delete).toHaveBeenCalledWith('/api/training-tips/4', AUTH);
});

test('toggleUpvote POSTs with anonymous_id query when anonymous', async () => {
  await toggleUpvote(4, 'anon_1');
  expect(api.post).toHaveBeenCalledWith('/api/training-tips/4/upvote?anonymous_id=anon_1', {}, {});
});

test('toggleUpvote POSTs without query when logged in', async () => {
  await toggleUpvote(4, null, UID);
  expect(api.post).toHaveBeenCalledWith('/api/training-tips/4/upvote', {}, AUTH);
});
