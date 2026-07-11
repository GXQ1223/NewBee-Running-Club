/**
 * Finance (Books Grid) API functions — committee/admin only.
 * Every call carries the X-Firebase-UID auth header.
 */

import { api } from './client';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const authHeader = (firebaseUid) => ({ 'X-Firebase-UID': firebaseUid });

/**
 * Get all finance categories grouped by kind
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { events, income_types, expenses } — each an array of {id, kind, code, name, is_active}
 */
export async function getFinanceCategories(firebaseUid) {
  return api.get('/api/finance/categories', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Create a finance category (code auto-assigned when omitted)
 * @param {Object} data - { kind: 'event'|'income_type'|'expense', name, code? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Created category
 */
export async function createFinanceCategory(data, firebaseUid) {
  return api.post('/api/finance/categories', data, authHeader(firebaseUid));
}

/**
 * Update a finance category (rename / archive)
 * @param {number} categoryId - Category ID
 * @param {Object} data - { name?, is_active? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated category
 */
export async function updateFinanceCategory(categoryId, data, firebaseUid) {
  return api.put(`/api/finance/categories/${categoryId}`, data, authHeader(firebaseUid));
}

/**
 * Get all income rows (unclassified first)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Array>} Donation ledger rows with income_type / event_code
 */
export async function getIncome(firebaseUid) {
  return api.get('/api/finance/income', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Classify one or more income rows
 * @param {Object} data - { donation_ids: [int], income_type, event_code? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { updated }
 */
export async function classifyIncome(data, firebaseUid) {
  return api.post('/api/finance/income/classify', data, authHeader(firebaseUid));
}

/**
 * Record a manual income row (cash, check, ...)
 * @param {Object} data - { name, amount, donation_date?, method?, memo?, income_type, event_code? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Created row
 */
export async function addManualIncome(data, firebaseUid) {
  return api.post('/api/finance/income/manual', data, authHeader(firebaseUid));
}

/**
 * Get all expense rows (unclassified first)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Array>} [{id, expense_date, vendor, amount, method, bank_description, event_code, expense_category_code}]
 */
export async function getExpenses(firebaseUid) {
  return api.get('/api/finance/expenses', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Classify one or more expense rows
 * @param {Object} data - { expense_ids: [int], event_code?, expense_category_code? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { updated }
 */
export async function classifyExpenses(data, firebaseUid) {
  return api.post('/api/finance/expenses/classify', data, authHeader(firebaseUid));
}

/**
 * Delete an expense row
 * @param {number} expenseId - Expense ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteExpense(expenseId, firebaseUid) {
  return api.delete(`/api/finance/expenses/${expenseId}`, authHeader(firebaseUid));
}

/**
 * Import a Chase bank CSV (expenses + income; duplicates skipped)
 * @param {string} csvText - Raw CSV file contents
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { expenses_added, income_added, duplicates, skipped_gmail_synced, errors }
 */
export async function importBankCsv(csvText, firebaseUid) {
  return api.post('/api/finance/bank-import', { csv_text: csvText }, authHeader(firebaseUid));
}

/**
 * Get the donor email directory
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Array>} [{id, name, email, is_insider}]
 */
export async function getDirectory(firebaseUid) {
  return api.get('/api/finance/directory', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Upsert a directory entry (matched by name)
 * @param {Object} data - { name, email, is_insider? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Upserted entry
 */
export async function upsertDirectoryEntry(data, firebaseUid) {
  return api.put('/api/finance/directory', data, authHeader(firebaseUid));
}

/**
 * Delete a directory entry
 * @param {number} entryId - Directory entry ID
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteDirectoryEntry(entryId, firebaseUid) {
  return api.delete(`/api/finance/directory/${entryId}`, authHeader(firebaseUid));
}

/**
 * Get the acknowledgment queue (classified donations not yet thanked)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Array>} [{donation_id, name, amount, donation_date, event_code, email|null}]
 */
export async function getAckQueue(firebaseUid) {
  return api.get('/api/finance/ack-queue', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Send acknowledgment emails for the queue (or a subset)
 * @param {number[]} [donationIds] - Specific donations; omit to send the whole queue
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { results, sent, skipped }
 */
export async function sendAcks(donationIds, firebaseUid) {
  const payload = donationIds ? { donation_ids: donationIds } : {};
  return api.post('/api/finance/send-acks', payload, authHeader(firebaseUid));
}

/**
 * By-event income/expense matrix report
 * @param {number|string} [year] - Calendar year; omit for all years
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { year, events, totals }
 */
export async function getReportByEvent(year, firebaseUid) {
  const params = year ? { year } : {};
  return api.get('/api/finance/reports/by-event', params, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Year-over-year comparison per event
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { years, events }
 */
export async function getReportYoy(firebaseUid) {
  return api.get('/api/finance/reports/yoy', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Public support test report — 509(a)(1) and 509(a)(2)
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Support totals, both tests, headroom, watch list
 */
export async function getReportPublicSupport(firebaseUid) {
  return api.get('/api/finance/reports/public-support', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Get finance settings
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} { auto_ack_enabled, org_start, fye_month }
 */
export async function getFinanceSettings(firebaseUid) {
  return api.get('/api/finance/settings', {}, authHeader(firebaseUid), { skipCache: true });
}

/**
 * Update finance settings
 * @param {Object} data - { auto_ack_enabled?, org_start?, fye_month? }
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<Object>} Updated settings
 */
export async function updateFinanceSettings(data, firebaseUid) {
  return api.put('/api/finance/settings', data, authHeader(firebaseUid));
}

/**
 * Download the by-event report as a CSV file.
 * Raw fetch because the response is a file, not JSON.
 * @param {number|string} [year] - Calendar year; omit for all years
 * @param {string} firebaseUid - Committee/admin Firebase UID
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function downloadByEventCsv(year, firebaseUid) {
  const query = year ? `?${new URLSearchParams({ year }).toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/api/finance/reports/by-event/export${query}`, {
    headers: { 'X-Firebase-UID': firebaseUid },
  });
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      detail = data?.detail || detail;
    } catch {
      // Response body is not JSON
    }
    throw new Error(detail);
  }
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : `newbee-finance-by-event${year ? `-${year}` : ''}.csv`;
  const blob = await response.blob();
  return { blob, filename };
}
