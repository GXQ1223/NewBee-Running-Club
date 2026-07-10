import { api, clearApiCache } from './client';
import {
  getActiveSections,
  getAllSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  uploadImage,
} from './homepageSections';

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

test('getActiveSections GETs public sections', async () => {
  await expect(getActiveSections()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/homepage-sections');
});

test('getAllSections GETs all sections with admin header', async () => {
  await getAllSections(UID);
  expect(api.get).toHaveBeenCalledWith('/api/homepage-sections/all', {}, AUTH);
});

test('getSectionById GETs a single section', async () => {
  await getSectionById(2);
  expect(api.get).toHaveBeenCalledWith('/api/homepage-sections/2');
});

test('createSection POSTs section data with admin header', async () => {
  const data = { title: 'About' };
  await createSection(data, UID);
  expect(api.post).toHaveBeenCalledWith('/api/homepage-sections', data, AUTH);
});

test('updateSection PUTs section data with admin header', async () => {
  await updateSection(2, { title: 'Story' }, UID);
  expect(api.put).toHaveBeenCalledWith('/api/homepage-sections/2', { title: 'Story' }, AUTH);
});

test('deleteSection DELETEs the section with admin header', async () => {
  await deleteSection(2, UID);
  expect(api.delete).toHaveBeenCalledWith('/api/homepage-sections/2', AUTH);
});

test('reorderSections PUTs the ordered id list', async () => {
  await reorderSections([3, 1, 2], UID);
  expect(api.put).toHaveBeenCalledWith(
    '/api/homepage-sections/reorder',
    { section_ids: [3, 1, 2] },
    AUTH
  );
});

describe('uploadImage', () => {
  const file = new File(['img'], 'pic.png', { type: 'image/png' });

  test('POSTs the file as form data and clears the sections cache', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://s3/pic.png' }),
    });

    const result = await uploadImage(file, UID);

    expect(result).toEqual({ url: 'https://s3/pic.png' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/upload/image`);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(AUTH);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBe(file);
    expect(clearApiCache).toHaveBeenCalledWith('/api/homepage-sections');
  });

  test('throws the server detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'too large' }),
    });

    await expect(uploadImage(file, UID)).rejects.toThrow('too large');
    expect(clearApiCache).not.toHaveBeenCalled();
  });

  test('falls back to a generic message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(uploadImage(file, UID)).rejects.toThrow('Failed to upload image');
  });
});
