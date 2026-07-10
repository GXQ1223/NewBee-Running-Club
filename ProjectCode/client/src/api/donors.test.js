import { api } from './client';
import {
  getAllDonors,
  getDonorsByType,
  getDonorById,
  createDonor,
  updateDonor,
  deleteDonor,
  getDonationSummary,
  getPublicDonors,
  getHideAmounts,
  toggleHideAmounts,
  linkDonorToMember,
} from './donors';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('getAllDonors GETs all donors', async () => {
  await expect(getAllDonors()).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/donors');
});

test('getDonorsByType GETs donors by type', async () => {
  await getDonorsByType('enterprise');
  expect(api.get).toHaveBeenCalledWith('/api/donors/enterprise');
});

test('getDonorById GETs donor by id', async () => {
  await getDonorById('D-1');
  expect(api.get).toHaveBeenCalledWith('/api/donors/id/D-1');
});

test('createDonor POSTs donor data', async () => {
  const data = { name: 'Alice', amount: 100 };
  await expect(createDonor(data)).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/donors', data);
});

test('updateDonor PUTs donor data', async () => {
  const data = { amount: 200 };
  await expect(updateDonor('D-1', data)).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/donors/D-1', data);
});

test('deleteDonor DELETEs the donor', async () => {
  await expect(deleteDonor('D-1')).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/donors/D-1');
});

test('getDonationSummary GETs the stats summary', async () => {
  await getDonationSummary();
  expect(api.get).toHaveBeenCalledWith('/api/donors/stats/summary');
});

test('getPublicDonors GETs the public donors list', async () => {
  await getPublicDonors();
  expect(api.get).toHaveBeenCalledWith('/api/donors/public');
});

test('getHideAmounts GETs the hide-amounts flag', async () => {
  await getHideAmounts();
  expect(api.get).toHaveBeenCalledWith('/api/donors/hide-amounts');
});

test('toggleHideAmounts PUTs the hide-amounts toggle', async () => {
  await toggleHideAmounts();
  expect(api.put).toHaveBeenCalledWith('/api/donors/hide-amounts');
});

test('linkDonorToMember PUTs the member link payload', async () => {
  await linkDonorToMember('D-1', 42);
  expect(api.put).toHaveBeenCalledWith('/api/donors/D-1/link-member', { member_id: 42 });
});
