import { api } from './client';
import { syncHeyloNow, getSyncedHeyloEvents } from './heylo';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
});

test('syncHeyloNow POSTs to sync-now with auth header', async () => {
  await expect(syncHeyloNow('uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/heylo/sync-now', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

test('getSyncedHeyloEvents GETs the synced list without cache', async () => {
  await expect(getSyncedHeyloEvents()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith(
    '/api/heylo/synced', {}, {}, { skipCache: true }
  );
});
