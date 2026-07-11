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
  revertDonation,
  sendThankYou,
  getThankYouPreview,
  getThankYouTemplates,
  createThankYouTemplate,
  updateThankYouTemplate,
  deleteThankYouTemplate,
  downloadReceipt,
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
  expect(api.put).toHaveBeenCalledWith('/api/donors/D-1', data, {});
});

test('updateDonor passes the auth header when a uid is given', async () => {
  await updateDonor('D-1', { notes: 'x' }, 'uid-1');
  expect(api.put).toHaveBeenCalledWith('/api/donors/D-1', { notes: 'x' }, { 'X-Firebase-UID': 'uid-1' });
});

test('deleteDonor DELETEs the donor', async () => {
  await expect(deleteDonor('D-1')).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/donors/D-1', {});
});

test('deleteDonor passes the auth header when a uid is given', async () => {
  await deleteDonor('D-1', 'uid-1');
  expect(api.delete).toHaveBeenCalledWith('/api/donors/D-1', { 'X-Firebase-UID': 'uid-1' });
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

test('revertDonation POSTs with auth header', async () => {
  await expect(revertDonation(7, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/revert', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

test('dismissDonation POSTs with auth header', async () => {
  await expect(dismissDonation(7, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/dismiss', {}, { 'X-Firebase-UID': 'uid-1' }
  );
});

test('sendThankYou POSTs recipient, edited letter and receipt flag', async () => {
  await expect(sendThankYou(7, {
    email: 'kevin@example.com',
    subject: 'Custom subject',
    message: 'Custom body',
    attachReceipt: true,
  }, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/donations/7/send-thank-you',
    { email: 'kevin@example.com', subject: 'Custom subject', message: 'Custom body', attach_receipt: true },
    { 'X-Firebase-UID': 'uid-1' }
  );
});

test('getThankYouPreview GETs the rendered letter, skipping cache', async () => {
  await getThankYouPreview(7, 'uid-1');
  expect(api.get).toHaveBeenCalledWith(
    '/api/donors/donations/7/thank-you-preview', {},
    { 'X-Firebase-UID': 'uid-1' }, { skipCache: true }
  );
});

test('getThankYouPreview passes an explicit template id (0 = built-in)', async () => {
  await getThankYouPreview(7, 'uid-1', 5);
  expect(api.get).toHaveBeenCalledWith(
    '/api/donors/donations/7/thank-you-preview', { template_id: 5 },
    { 'X-Firebase-UID': 'uid-1' }, { skipCache: true }
  );
  await getThankYouPreview(7, 'uid-1', 0);
  expect(api.get).toHaveBeenCalledWith(
    '/api/donors/donations/7/thank-you-preview', { template_id: 0 },
    { 'X-Firebase-UID': 'uid-1' }, { skipCache: true }
  );
});

test('template CRUD helpers hit the right endpoints with auth', async () => {
  await getThankYouTemplates('uid-1');
  expect(api.get).toHaveBeenCalledWith(
    '/api/donors/thank-you-templates', {},
    { 'X-Firebase-UID': 'uid-1' }, { skipCache: true }
  );
  await createThankYouTemplate({ name: 'T' }, 'uid-1');
  expect(api.post).toHaveBeenCalledWith(
    '/api/donors/thank-you-templates', { name: 'T' }, { 'X-Firebase-UID': 'uid-1' }
  );
  await updateThankYouTemplate(5, { body: 'B' }, 'uid-1');
  expect(api.put).toHaveBeenCalledWith(
    '/api/donors/thank-you-templates/5', { body: 'B' }, { 'X-Firebase-UID': 'uid-1' }
  );
  await deleteThankYouTemplate(5, 'uid-1');
  expect(api.delete).toHaveBeenCalledWith(
    '/api/donors/thank-you-templates/5', { 'X-Firebase-UID': 'uid-1' }
  );
});

describe('downloadReceipt', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('fetches the receipt PDF and returns blob + filename', async () => {
    const blob = new Blob(['pdf']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'attachment; filename="NewBee_Donation_Receipt_20260703_Test_Donor.pdf"' },
      blob: () => Promise.resolve(blob),
    });
    const result = await downloadReceipt(7, 'uid-1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/donors/donations/7/receipt'),
      { headers: { 'X-Firebase-UID': 'uid-1' } }
    );
    expect(result.filename).toBe('NewBee_Donation_Receipt_20260703_Test_Donor.pdf');
    expect(result.blob).toBe(blob);
  });

  test('throws the API detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'Receipts are only issued for confirmed donations' }),
    });
    await expect(downloadReceipt(7, 'uid-1')).rejects.toThrow(
      'Receipts are only issued for confirmed donations'
    );
  });
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
