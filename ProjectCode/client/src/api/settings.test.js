import { api } from './client';
import {
  getJoinRequirements,
  getSocialLinks,
  getAllSettings,
  getSettingsByCategory,
  updateSetting,
  createSetting,
} from './settings';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'admin-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
});

test('getJoinRequirements GETs join requirements', async () => {
  await expect(getJoinRequirements()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/settings/join-requirements');
});

test('getSocialLinks GETs social links', async () => {
  await getSocialLinks();
  expect(api.get).toHaveBeenCalledWith('/api/settings/social-links');
});

test('getAllSettings GETs all settings with UID header', async () => {
  await getAllSettings(UID);
  expect(api.get).toHaveBeenCalledWith('/api/settings', {}, AUTH);
});

test('getSettingsByCategory GETs category settings with UID header', async () => {
  await getSettingsByCategory('social', UID);
  expect(api.get).toHaveBeenCalledWith('/api/settings/category/social', {}, AUTH);
});

test('updateSetting PUTs setting data with UID header', async () => {
  const data = { value: 'https://insta', is_active: true };
  await expect(updateSetting('social_instagram', data, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/settings/social_instagram', data, AUTH);
});

test('createSetting POSTs setting data with UID header', async () => {
  const data = { key: 'social_x', value: 'https://x.com' };
  await expect(createSetting(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/settings', data, AUTH);
});
