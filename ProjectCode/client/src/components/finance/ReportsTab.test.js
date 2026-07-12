import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReportsTab from './ReportsTab';
import { useAuth } from '../../context';
import {
  getReportByEvent, getReportYoy, getReportPublicSupport, downloadByEventCsv,
} from '../../api/finance';

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../api/finance', () => ({
  getReportByEvent: jest.fn(),
  getReportYoy: jest.fn(),
  getReportPublicSupport: jest.fn(),
  downloadByEventCsv: jest.fn(),
}));

const byEventData = {
  year: null,
  events: [
    { event_code: 1001, event_name: 'General', donation: 5320, event_revenue: 0, pass_through: 0, income_total: 5320, expense_total: 1214, net: 4106 },
    { event_code: 1002, event_name: 'Bear Mt. Run 熊山', donation: 500, event_revenue: 0, pass_through: 1080, income_total: 1580, expense_total: 1466, net: 114 },
  ],
  totals: { donation: 5820, event_revenue: 0, pass_through: 1080, income_total: 6900, expense_total: 2680, net: 4220 },
};

const yoyData = {
  years: ['2025', '2026'],
  events: [
    {
      event_code: 1001,
      event_name: 'General',
      years: {
        2025: { income: 100, expense: 50, net: 50 },
        2026: { income: 200, expense: 80, net: 120 },
      },
    },
    { event_code: 1002, event_name: 'Bear Mt. Run 熊山', years: {} },
  ],
};

const publicSupportData = {
  disclaimer: 'Estimates only — confirm with a CPA before filing. 仅供参考。',
  org_start: '2016-06-01',
  fye_month: 12,
  window_fys: [2021, 2025],
  support: { contributions: 10000, gross_receipts: 2000, total_support: 12000 },
  test1_509a1: {
    total_support: 12000, cap_2pct: 240, public_support: 9000,
    excluded_by_cap: 1000, ratio: 0.75, passes: true,
  },
  test2_509a2: {
    dqp_excluded: 500, public_support: 11500, ratio: 0.9583, passes: false,
    dqp_rows: [{ name: 'Brandon Li', amount: 500, reason: 'Officer 委员' }],
  },
  headroom: { max_gift_a1: 3000, max_gift_a2: 2500 },
  watch_list: [
    { name: 'Yue Ma', total: 800, insider: false },
    { name: 'Brandon Li', total: 500, insider: true },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getReportByEvent.mockResolvedValue(byEventData);
  getReportYoy.mockResolvedValue(yoyData);
  getReportPublicSupport.mockResolvedValue(publicSupportData);
  downloadByEventCsv.mockResolvedValue({ blob: new Blob(['csv']), filename: 'by-event.csv' });
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
});

test('renders the by-event matrix with a totals row', async () => {
  render(<ReportsTab />);
  expect(await screen.findByText('General')).toBeInTheDocument();
  expect(screen.getByText('Bear Mt. Run 熊山')).toBeInTheDocument();
  expect(screen.getAllByText('$5,320').length).toBe(2); // donation + income total columns
  expect(screen.getByText('-$1,214')).toBeInTheDocument(); // expenses shown negative
  expect(screen.getByText('$4,106')).toBeInTheDocument(); // net
  expect(screen.getAllByText('TOTAL 合计').length).toBe(2); // header + totals row
  expect(screen.getByText('$4,220')).toBeInTheDocument(); // total net
  expect(getReportByEvent).toHaveBeenCalledWith(undefined, 'admin-uid');
});

test('zero amounts render as an em dash', async () => {
  render(<ReportsTab />);
  await screen.findByText('General');
  // event_revenue is 0 for both rows and the totals row
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
});

test('changing the year refetches the by-event report', async () => {
  render(<ReportsTab />);
  await screen.findByText('General');

  fireEvent.mouseDown(screen.getByLabelText('Report year 年份').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: '2026' }));

  await waitFor(() => expect(getReportByEvent).toHaveBeenCalledWith('2026', 'admin-uid'));
});

test('exports the by-event CSV and triggers a download', async () => {
  render(<ReportsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getByText('Export CSV 导出'));
  await waitFor(() => expect(downloadByEventCsv).toHaveBeenCalledWith(undefined, 'admin-uid'));
  await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());
});

test('shows an error when the CSV export fails', async () => {
  downloadByEventCsv.mockRejectedValue(new Error('500'));
  render(<ReportsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getByText('Export CSV 导出'));
  expect(await screen.findByText(/导出 CSV 失败/)).toBeInTheDocument();
});

test('YoY sub-tab shows income / expense / net per year', async () => {
  render(<ReportsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getByText('YoY 同比'));

  expect(screen.getByText('2025 · income / expense / net')).toBeInTheDocument();
  expect(screen.getByText('2026 · income / expense / net')).toBeInTheDocument();
  const rows = screen.getAllByRole('row');
  const generalRow = rows.find((r) => within(r).queryByText('General'));
  expect(generalRow).toHaveTextContent('$100 / -$50 / $50');
  expect(generalRow).toHaveTextContent('$200 / -$80 / $120');
  // Event with no data in either year shows dashes
  const bearRow = rows.find((r) => within(r).queryByText('Bear Mt. Run 熊山'));
  expect(within(bearRow).getAllByText('—')).toHaveLength(2);
});

test('public support sub-tab shows both tests with pass/fail chips', async () => {
  render(<ReportsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getByText('Public support 509(a)'));

  expect(screen.getByText('Test 1 · 509(a)(1)')).toBeInTheDocument();
  expect(screen.getByText('Test 2 · 509(a)(2)')).toBeInTheDocument();
  expect(screen.getByText('PASS 通过')).toBeInTheDocument();
  expect(screen.getByText('FAIL 未通过')).toBeInTheDocument();
  expect(screen.getByText('75.0%')).toBeInTheDocument();
  expect(screen.getByText('95.8%')).toBeInTheDocument();
  // Window + support block
  expect(screen.getByText(/Support window 支持期 FY2021 – FY2025/)).toBeInTheDocument();
  // Headroom
  expect(screen.getByText(/max single gift 单笔最大捐款/)).toBeInTheDocument();
  expect(screen.getByText('$3,000')).toBeInTheDocument();
  // DQP table
  expect(screen.getByText('Disqualified person 关联人')).toBeInTheDocument();
  expect(screen.getByText('Officer 委员')).toBeInTheDocument();
  // Watch list with insider chip
  expect(screen.getByText('Yue Ma')).toBeInTheDocument();
  expect(screen.getByText('insider 内部人')).toBeInTheDocument();
  // Disclaimer
  expect(screen.getByText(/confirm with a CPA/)).toBeInTheDocument();
});

test('hides the DQP and watch list tables when empty', async () => {
  getReportPublicSupport.mockResolvedValue({
    ...publicSupportData,
    test2_509a2: { ...publicSupportData.test2_509a2, dqp_rows: [] },
    watch_list: [],
  });
  render(<ReportsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getByText('Public support 509(a)'));
  expect(screen.queryByText('Disqualified person 关联人')).not.toBeInTheDocument();
  expect(screen.queryByText(/Watch list 关注名单/)).not.toBeInTheDocument();
});

test('shows an error when the reports fail to load', async () => {
  getReportYoy.mockRejectedValue(new Error('500'));
  getReportPublicSupport.mockRejectedValue(new Error('500'));
  render(<ReportsTab />);
  expect(await screen.findByText(/加载报表失败/)).toBeInTheDocument();
});

test('shows an error when the by-event report fails', async () => {
  getReportByEvent.mockRejectedValue(new Error('500'));
  render(<ReportsTab />);
  expect(await screen.findByText(/加载活动报表失败/)).toBeInTheDocument();
});

test('fetches nothing without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<ReportsTab />);
  expect(getReportYoy).not.toHaveBeenCalled();
  expect(getReportByEvent).not.toHaveBeenCalled();
});
