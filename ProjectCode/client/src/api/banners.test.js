import { api } from './client';
import {
  getActiveBanners,
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  getCarouselBanners,
} from './banners';

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
  api.delete.mockResolvedValue('DELETE');
});

test('getActiveBanners GETs public banners', async () => {
  await expect(getActiveBanners()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/banners');
});

test('getAllBanners GETs all banners with admin header', async () => {
  await expect(getAllBanners(UID)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/banners/all', {}, AUTH);
});

test('getBannerById GETs a single banner', async () => {
  await expect(getBannerById(4)).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/banners/4');
});

test('createBanner POSTs banner data with admin header', async () => {
  const data = { title: 'New' };
  await expect(createBanner(data, UID)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/banners', data, AUTH);
});

test('updateBanner PUTs banner data with admin header', async () => {
  const data = { title: 'Edit' };
  await expect(updateBanner(4, data, UID)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/banners/4', data, AUTH);
});

test('deleteBanner DELETEs the banner with admin header', async () => {
  await expect(deleteBanner(4, UID)).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/banners/4', AUTH);
});

test('getCarouselBanners GETs the carousel endpoint', async () => {
  await expect(getCarouselBanners()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/banners/carousel');
});
