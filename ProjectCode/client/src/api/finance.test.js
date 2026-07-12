import { api } from './client';
import {
  getFinanceCategories,
  createFinanceCategory,
  updateFinanceCategory,
  getIncome,
  classifyIncome,
  addManualIncome,
  getExpenses,
  classifyExpenses,
  deleteExpense,
  importBankCsv,
  getDirectory,
  upsertDirectoryEntry,
  deleteDirectoryEntry,
  getAckQueue,
  sendAcks,
  getReportByEvent,
  getReportYoy,
  getReportPublicSupport,
  getFinanceSettings,
  updateFinanceSettings,
  downloadByEventCsv,
} from './finance';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const AUTH = { 'X-Firebase-UID': 'uid-1' };
const SKIP = { skipCache: true };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

test('getFinanceCategories GETs categories with auth, skipping cache', async () => {
  await expect(getFinanceCategories('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/categories', {}, AUTH, SKIP);
});

test('createFinanceCategory POSTs the new category', async () => {
  await expect(createFinanceCategory({ kind: 'event', name: 'Bear Mt. Run' }, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/finance/categories', { kind: 'event', name: 'Bear Mt. Run' }, AUTH
  );
});

test('updateFinanceCategory PUTs the rename/archive payload', async () => {
  await expect(updateFinanceCategory(3, { name: 'Gala', is_active: false }, 'uid-1')).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith(
    '/api/finance/categories/3', { name: 'Gala', is_active: false }, AUTH
  );
});

test('getIncome GETs income rows with auth, skipping cache', async () => {
  await expect(getIncome('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/income', {}, AUTH, SKIP);
});

test('classifyIncome POSTs the ids, type and event', async () => {
  const payload = { donation_ids: [1, 2], income_type: 'pass_through', event_code: 12 };
  await expect(classifyIncome(payload, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/finance/income/classify', payload, AUTH);
});

test('addManualIncome POSTs the manual row', async () => {
  const payload = { name: 'Cash box', amount: 40, income_type: 'event_revenue' };
  await expect(addManualIncome(payload, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/finance/income/manual', payload, AUTH);
});

test('getExpenses GETs expense rows with auth, skipping cache', async () => {
  await expect(getExpenses('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/expenses', {}, AUTH, SKIP);
});

test('classifyExpenses POSTs ids with event and category codes', async () => {
  const payload = { expense_ids: [7], event_code: 11, expense_category_code: 201 };
  await expect(classifyExpenses(payload, 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith('/api/finance/expenses/classify', payload, AUTH);
});

test('deleteExpense DELETEs the expense', async () => {
  await expect(deleteExpense(9, 'uid-1')).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/finance/expenses/9', AUTH);
});

test('importBankCsv POSTs the raw CSV text', async () => {
  await expect(importBankCsv('Date,Amount\n1/2/26,-30', 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/finance/bank-import', { csv_text: 'Date,Amount\n1/2/26,-30' }, AUTH
  );
});

test('getDirectory GETs the directory with auth, skipping cache', async () => {
  await expect(getDirectory('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/directory', {}, AUTH, SKIP);
});

test('upsertDirectoryEntry PUTs the entry', async () => {
  const payload = { name: 'Li Chen', email: 'li@example.com', is_insider: true };
  await expect(upsertDirectoryEntry(payload, 'uid-1')).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/finance/directory', payload, AUTH);
});

test('deleteDirectoryEntry DELETEs the entry', async () => {
  await expect(deleteDirectoryEntry(4, 'uid-1')).resolves.toBe('DELETE');
  expect(api.delete).toHaveBeenCalledWith('/api/finance/directory/4', AUTH);
});

test('getAckQueue GETs the queue with auth, skipping cache', async () => {
  await expect(getAckQueue('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/ack-queue', {}, AUTH, SKIP);
});

test('sendAcks POSTs specific donation ids when given', async () => {
  await expect(sendAcks([1, 2, 3], 'uid-1')).resolves.toBe('POST');
  expect(api.post).toHaveBeenCalledWith(
    '/api/finance/send-acks', { donation_ids: [1, 2, 3] }, AUTH
  );
});

test('sendAcks POSTs an empty payload to send the whole queue', async () => {
  await sendAcks(undefined, 'uid-1');
  expect(api.post).toHaveBeenCalledWith('/api/finance/send-acks', {}, AUTH);
});

test('getReportByEvent GETs the matrix, passing the year when given', async () => {
  await expect(getReportByEvent(2026, 'uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith(
    '/api/finance/reports/by-event', { year: 2026 }, AUTH, SKIP
  );
});

test('getReportByEvent omits the year param for all years', async () => {
  await getReportByEvent(undefined, 'uid-1');
  expect(api.get).toHaveBeenCalledWith('/api/finance/reports/by-event', {}, AUTH, SKIP);
});

test('getReportYoy GETs the year-over-year report', async () => {
  await expect(getReportYoy('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/reports/yoy', {}, AUTH, SKIP);
});

test('getReportPublicSupport GETs the 509(a) report', async () => {
  await expect(getReportPublicSupport('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/reports/public-support', {}, AUTH, SKIP);
});

test('getFinanceSettings GETs settings with auth, skipping cache', async () => {
  await expect(getFinanceSettings('uid-1')).resolves.toBe('GET');
  expect(api.get).toHaveBeenCalledWith('/api/finance/settings', {}, AUTH, SKIP);
});

test('updateFinanceSettings PUTs the settings payload', async () => {
  const payload = { auto_ack_enabled: true, fye_month: 12 };
  await expect(updateFinanceSettings(payload, 'uid-1')).resolves.toBe('PUT');
  expect(api.put).toHaveBeenCalledWith('/api/finance/settings', payload, AUTH);
});

describe('downloadByEventCsv', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('fetches the CSV with the year and returns blob + filename', async () => {
    const blob = new Blob(['csv']);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'attachment; filename="newbee-finance-2026.csv"' },
      blob: () => Promise.resolve(blob),
    });

    const result = await downloadByEventCsv(2026, 'uid-1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/finance/reports/by-event/export?year=2026'),
      { headers: { 'X-Firebase-UID': 'uid-1' } }
    );
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe('newbee-finance-2026.csv');
  });

  test('omits the query and falls back to a default filename', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob(['csv'])),
    });

    const result = await downloadByEventCsv(undefined, 'uid-1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/finance\/reports\/by-event\/export$/),
      { headers: { 'X-Firebase-UID': 'uid-1' } }
    );
    expect(result.filename).toBe('newbee-finance-by-event.csv');
  });

  test('throws the API detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'Committee access required' }),
    });
    await expect(downloadByEventCsv(2026, 'uid-1')).rejects.toThrow('Committee access required');
  });

  test('throws a status message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    await expect(downloadByEventCsv(2026, 'uid-1')).rejects.toThrow('Request failed with status 500');
  });
});
