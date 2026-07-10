import { api } from './client';
import {
  getClubRuleVersions,
  createClubRuleVersion,
  updateClubRuleVersion,
  deleteClubRuleVersion,
} from './clubRules';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const UID = 'committee-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('getClubRuleVersions GETs all rule versions', async () => {
  await expect(getClubRuleVersions()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/club-rules');
});

test('createClubRuleVersion POSTs version data with UID header', async () => {
  const data = { year_label: '2026', title: 'Rules', content: '...', is_current: true };
  await expect(createClubRuleVersion(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/club-rules', data, AUTH);
});

test('updateClubRuleVersion PUTs version data with UID header', async () => {
  const data = { title: 'Rules v2' };
  await expect(updateClubRuleVersion(9, data, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/club-rules/9', data, AUTH);
});

test('deleteClubRuleVersion DELETEs the version with UID header', async () => {
  await expect(deleteClubRuleVersion(9, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/club-rules/9', AUTH);
});
