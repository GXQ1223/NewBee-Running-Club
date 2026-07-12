import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FinancePage from './FinancePage';
import { useAuth, useAdmin } from '../context';
import { getAckQueue, sendAcks, importBankCsv } from '../api/finance';
import { runGmailSync } from '../api/donors';

jest.mock('../context', () => ({
  useAuth: jest.fn(),
  useAdmin: jest.fn(),
}));
jest.mock('../api/finance', () => ({
  getAckQueue: jest.fn(),
  sendAcks: jest.fn(),
  importBankCsv: jest.fn(),
}));
jest.mock('../api/donors', () => ({
  runGmailSync: jest.fn(),
}));

jest.mock('../components/finance/IncomeGrid', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'income-grid' },
    `income-refresh:${props.refreshKey}`,
    React.createElement('button', { onClick: props.onChanged }, 'income-changed')
  );
});
jest.mock('../components/finance/ExpensesGrid', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'expenses-grid' }, `expenses-refresh:${props.refreshKey}`);
});
jest.mock('../components/finance/ReportsTab', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'reports-tab' });
});
jest.mock('../components/finance/DirectoryTab', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'directory-tab' });
});
jest.mock('../components/finance/FinanceSettingsTab', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'settings-tab' });
});

const queue = [
  { donation_id: 1, name: 'Yue Ma', amount: '500.00', donation_date: '2026-06-04', event_code: 1001, email: 'yue@x.com' },
  { donation_id: 2, name: 'Kevin Gu', amount: '15.00', donation_date: '2026-07-06', event_code: 1001, email: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  useAdmin.mockReturnValue({ adminModeEnabled: true });
  getAckQueue.mockResolvedValue(queue);
  sendAcks.mockResolvedValue({ results: [], sent: 1, skipped: 1 });
  importBankCsv.mockResolvedValue({
    expenses_added: 3, income_added: 1, duplicates: 2, skipped_gmail_synced: 4, errors: [],
  });
  runGmailSync.mockResolvedValue({ emails_found: 2, inserted: 1 });
});

test('shows the admin gate when admin mode is off and fetches nothing', () => {
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  render(<FinancePage />);
  expect(screen.getByText(/Admin mode required 需要管理员模式/)).toBeInTheDocument();
  expect(screen.queryByTestId('income-grid')).not.toBeInTheDocument();
  expect(getAckQueue).not.toHaveBeenCalled();
});

test('renders the sheet tabs with the income grid active by default', async () => {
  render(<FinancePage />);
  expect(screen.getByText('📚 Finance 财务工作台')).toBeInTheDocument();
  expect(screen.getByText('💵 Income 收入')).toBeInTheDocument();
  expect(screen.getByText('💸 Expenses 支出')).toBeInTheDocument();
  expect(screen.getByText('🧾 Reports 报表')).toBeInTheDocument();
  expect(screen.getByText('👥 Directory 通讯录')).toBeInTheDocument();
  expect(screen.getByText('⚙️ Settings')).toBeInTheDocument();
  expect(screen.getByTestId('income-grid')).toBeInTheDocument();
  expect(await screen.findByText('✉ Send 2 acks 群发致谢')).toBeInTheDocument();
});

test('switches worksheets when a tab is clicked', async () => {
  render(<FinancePage />);
  fireEvent.click(screen.getByText('💸 Expenses 支出'));
  expect(screen.getByTestId('expenses-grid')).toBeInTheDocument();
  expect(screen.queryByTestId('income-grid')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('🧾 Reports 报表'));
  expect(screen.getByTestId('reports-tab')).toBeInTheDocument();
  fireEvent.click(screen.getByText('👥 Directory 通讯录'));
  expect(screen.getByTestId('directory-tab')).toBeInTheDocument();
  fireEvent.click(screen.getByText('⚙️ Settings'));
  expect(screen.getByTestId('settings-tab')).toBeInTheDocument();
  fireEvent.click(screen.getByText('💵 Income 收入'));
  expect(screen.getByTestId('income-grid')).toBeInTheDocument();
});

test('Scan Gmail syncs, notifies and refreshes the grids', async () => {
  render(<FinancePage />);
  expect(screen.getByText('income-refresh:0')).toBeInTheDocument();
  fireEvent.click(screen.getByText('↻ Scan Gmail 扫描邮件'));
  await waitFor(() => expect(runGmailSync).toHaveBeenCalledWith('admin-uid'));
  expect(await screen.findByText(/Gmail scan finished/)).toBeInTheDocument();
  expect(screen.getByText('income-refresh:1')).toBeInTheDocument();
});

test('shows an error when the Gmail scan fails', async () => {
  runGmailSync.mockRejectedValue(new Error('503'));
  render(<FinancePage />);
  fireEvent.click(screen.getByText('↻ Scan Gmail 扫描邮件'));
  expect(await screen.findByText(/Gmail scan failed/)).toBeInTheDocument();
  expect(screen.getByText('income-refresh:0')).toBeInTheDocument();
});

test('imports a Chase CSV through the hidden file input', async () => {
  render(<FinancePage />);
  // The visible button just proxies to the hidden input
  fireEvent.click(screen.getByText('⬆ Import Chase CSV 导入账单'));
  const input = screen.getByTestId('chase-csv-input');
  const file = new File(['Details,Posting Date,Description,Amount\nDEBIT,07/01/2026,NYRR,-120.00'], 'chase.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(importBankCsv).toHaveBeenCalledWith(
    expect.stringContaining('NYRR'), 'admin-uid'
  ));
  expect(await screen.findByText(/3 expenses 支出 · 1 income 收入 · 2 duplicates skipped 重复跳过 · 4 already synced 已同步/)).toBeInTheDocument();
  expect(screen.getByText('income-refresh:1')).toBeInTheDocument();
});

test('shows an error when the CSV import fails', async () => {
  importBankCsv.mockRejectedValue(new Error('bad csv'));
  render(<FinancePage />);
  const input = screen.getByTestId('chase-csv-input');
  fireEvent.change(input, { target: { files: [new File(['x'], 'chase.csv', { type: 'text/csv' })] } });
  expect(await screen.findByText(/CSV import failed/)).toBeInTheDocument();
});

test('ignores an empty file selection', async () => {
  render(<FinancePage />);
  const input = screen.getByTestId('chase-csv-input');
  fireEvent.change(input, { target: { files: [] } });
  await waitFor(() => expect(importBankCsv).not.toHaveBeenCalled());
});

test('sends the whole ack queue and reports the outcome', async () => {
  render(<FinancePage />);
  const button = await screen.findByText('✉ Send 2 acks 群发致谢');
  fireEvent.click(button);
  await waitFor(() => expect(sendAcks).toHaveBeenCalledWith(undefined, 'admin-uid'));
  expect(await screen.findByText(/1 sent 已发送 · 1 skipped/)).toBeInTheDocument();
  // Queue is re-fetched after sending
  expect(getAckQueue.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test('shows an error when sending acks fails', async () => {
  sendAcks.mockRejectedValue(new Error('smtp down'));
  render(<FinancePage />);
  fireEvent.click(await screen.findByText('✉ Send 2 acks 群发致谢'));
  expect(await screen.findByText(/Failed to send acknowledgments/)).toBeInTheDocument();
});

test('disables the ack button when the queue is empty', async () => {
  getAckQueue.mockResolvedValue([]);
  render(<FinancePage />);
  const button = await screen.findByText('✉ Send 0 acks 群发致谢');
  expect(button.closest('button')).toBeDisabled();
});

test('survives an ack-queue load failure', async () => {
  getAckQueue.mockRejectedValue(new Error('500'));
  render(<FinancePage />);
  expect(await screen.findByText('✉ Send 0 acks 群发致谢')).toBeInTheDocument();
});

test('refreshes the ack queue when the income grid reports a change', async () => {
  render(<FinancePage />);
  await screen.findByText('✉ Send 2 acks 群发致谢');
  const callsBefore = getAckQueue.mock.calls.length;
  fireEvent.click(screen.getByText('income-changed'));
  await waitFor(() => expect(getAckQueue.mock.calls.length).toBe(callsBefore + 1));
});

test('notices can be dismissed', async () => {
  render(<FinancePage />);
  fireEvent.click(screen.getByText('↻ Scan Gmail 扫描邮件'));
  const alert = await screen.findByText(/Gmail scan finished/);
  fireEvent.click(screen.getByTitle('Close'));
  await waitFor(() => expect(alert).not.toBeInTheDocument());
});
