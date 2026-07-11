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
  getDonationLedger,
  approveDonation,
  dismissDonation,
  runGmailSync,
  downloadTaxReport,
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

test('getDonationLedger GETs the ledger with auth header, skipping cache', async () => {
  await expect(getDonationLedger('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith(
    '/api/donors/ledger', {}, { 'X-Firebase-UID': 'uid-1' }, { skipCache: true }
  );
});

test('approveDonation POSTs corrections with auth header', async () => {
  await expect(approveDonation(7, { donor_type: 'enterprise' }, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/approve',
    { donor_type: 'enterprise' },
    { 'X-Firebase-UID': 'uid-1' }
  );
});

test('approveDonation defaults to empty corrections', async () => {
  await approveDonation(7, undefined, 'uid-1');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/approve', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

test('dismissDonation POSTs with auth header', async () => {
  await expect(dismissDonation(7, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/dismiss', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

test('runGmailSync POSTs with auth header', async () => {
  await expect(runGmailSync('uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/sync-gmail', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

describe('downloadTaxReport', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('fetches the report and returns blob + filename from headers', async () => {
    const blob = new Blob(['csv']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'attachment; filename="report-2025.csv"' },
      blob: () => Promise.resolve(blob),
    });

    const result = await downloadTaxReport(
      { startDate: '2025-01-01', endDate: '2025-12-31', format: 'csv' }, 'uid-1'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/donors/tax-report?start_date=2025-01-01&end_date=2025-12-31&format=csv'),
      { headers: { 'X-Firebase-UID': 'uid-1' } }
    );
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe('report-2025.csv');
  });

  test('falls back to a default filename without a disposition header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob(['pdf'])),
    });

    const result = await downloadTaxReport(
      { startDate: '2025-01-01', endDate: '2025-12-31', format: 'pdf' }, 'uid-1'
    );
    expect(result.filename).toBe('newbee-donations-2025-01-01-to-2025-12-31.pdf');
  });

  test('throws the API detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'Format must be csv or pdf' }),
    });

    await expect(
      downloadTaxReport({ startDate: '2025-01-01', endDate: '2025-12-31', format: 'xlsx' }, 'uid-1')
    ).rejects.toThrow('Format must be csv or pdf');
  });

  test('throws a status message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(
      downloadTaxReport({ startDate: '2025-01-01', endDate: '2025-12-31', format: 'csv' }, 'uid-1')
    ).rejects.toThrow('Request failed with status 500');
  });
});
