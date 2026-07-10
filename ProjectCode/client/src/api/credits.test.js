import { api, clearApiCache } from './client';
import {
  getCredits,
  getMemberCredits,
  getCreditById,
  createCredit,
  updateCredit,
  deleteCredit,
  bulkUploadCredits,
} from './credits';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  clearApiCache: jest.fn(),
}));

const BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
const UID = 'admin-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

afterEach(() => {
  delete global.fetch;
});

test('getCredits GETs all credits without params by default', async () => {
  await expect(getCredits()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/credits', {});
});

test('getCredits filters by credit_type when provided', async () => {
  await getCredits('volunteer');
  expect(api.get).toHaveBeenCalledWith('/api/credits', { credit_type: 'volunteer' });
});

test('getMemberCredits URL-encodes the member name', async () => {
  await getMemberCredits('Jane Doe');
  expect(api.get).toHaveBeenCalledWith('/api/credits/member/Jane%20Doe');
});

test('getCreditById GETs a single credit', async () => {
  await getCreditById(3);
  expect(api.get).toHaveBeenCalledWith('/api/credits/3');
});

test('createCredit POSTs credit data with UID header', async () => {
  const data = { member: 'Jane', amount: 2 };
  await createCredit(data, UID);
  expect(api.post).toHaveBeenCalledWith('/api/credits', data, AUTH);
});

test('updateCredit PUTs credit data with UID header', async () => {
  await updateCredit(3, { amount: 5 }, UID);
  expect(api.put).toHaveBeenCalledWith('/api/credits/3', { amount: 5 }, AUTH);
});

test('deleteCredit DELETEs the credit with UID header', async () => {
  await deleteCredit(3, UID);
  expect(api.delete).toHaveBeenCalledWith('/api/credits/3', AUTH);
});

describe('bulkUploadCredits', () => {
  const file = new File(['name,reg\nJane,1'], 'credits.csv', { type: 'text/csv' });

  test('POSTs multipart form data and clears the credits cache', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ created: 3 }),
    });

    const result = await bulkUploadCredits(file, 'total', 'merge', UID);

    expect(result).toEqual({ created: 3 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/credits/bulk-upload`);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(AUTH);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBe(file);
    expect(options.body.get('credit_type')).toBe('total');
    expect(options.body.get('mode')).toBe('merge');
    expect(clearApiCache).toHaveBeenCalledWith('/api/credits');
  });

  test('throws the server detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'bad csv' }),
    });

    await expect(bulkUploadCredits(file, 'total', 'replace', UID)).rejects.toThrow('bad csv');
    expect(clearApiCache).not.toHaveBeenCalled();
  });

  test('falls back to a status message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(bulkUploadCredits(file, 'total', 'replace', UID)).rejects.toThrow(
      'Upload failed with status 500'
    );
  });
});
