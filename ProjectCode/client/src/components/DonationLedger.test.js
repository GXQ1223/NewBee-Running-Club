import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DonationLedger from './DonationLedger';
import { useAuth } from '../context';
import {
  getDonationLedger,
  approveDonation,
  dismissDonation,
  runGmailSync,
  downloadTaxReport,
} from '../api/donors';

jest.mock('../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../api/donors', () => ({
  getDonationLedger: jest.fn(),
  approveDonation: jest.fn(),
  dismissDonation: jest.fn(),
  runGmailSync: jest.fn(),
  downloadTaxReport: jest.fn(),
}));

const currentYear = new Date().getFullYear();

const ledgerData = {
  donations: [
    {
      donation_id: 10,
      donor_id: 'IND_10',
      name: 'Ming Zhao',
      donor_type: 'individual',
      amount: '150.00',
      donation_date: `${currentYear}-07-08`,
      source: 'Zelle (Ming Zhao)',
      receipt_confirmed: true,
      status: 'pending',
      thank_you_sent_at: null,
      email_excerpt: 'Zelle payment received — Ming Zhao sent you $150.00 · Memo: Keep running!',
      notes: 'Zelle Transaction #23456789012',
    },
    {
      donation_id: 11,
      donor_id: 'IND_11',
      name: 'Li Chen',
      donor_type: 'individual',
      amount: '200.00',
      donation_date: `${currentYear}-06-04`,
      source: 'Zelle (Li Chen)',
      receipt_confirmed: true,
      status: 'confirmed',
      thank_you_sent_at: `${currentYear}-06-05T10:00:00`,
      email_excerpt: 'Zelle payment received — Li Chen sent you $200.00',
    },
    {
      donation_id: 12,
      donor_id: 'ENT_12',
      name: 'Golden Wheat Bakery',
      donor_type: 'enterprise',
      amount: '800.00',
      donation_date: `${currentYear - 1}-06-01`,
      source: 'Manual entry',
      receipt_confirmed: true,
      status: 'confirmed',
      thank_you_sent_at: null,
      notes: 'check #1042',
    },
    {
      donation_id: 13,
      donor_id: 'IND_13',
      name: 'Spam Sender',
      donor_type: 'individual',
      amount: '5.00',
      donation_date: `${currentYear}-07-01`,
      source: 'Zelle (Spam Sender)',
      receipt_confirmed: false,
      status: 'dismissed',
    },
  ],
  stats: {
    ytd_total: '200.00',
    ytd_count: 1,
    alltime_total: '1000.00',
    alltime_count: 2,
    donor_count: 2,
    pending_count: 1,
    unthanked_count: 1,
  },
  sync: {
    last_run: `${currentYear}-07-06T04:30:00`,
    last_result: { emails_found: 2, inserted: 1 },
    next_run: `${currentYear}-07-13T04:30:00`,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getDonationLedger.mockResolvedValue(ledgerData);
  approveDonation.mockResolvedValue({});
  dismissDonation.mockResolvedValue({});
  runGmailSync.mockResolvedValue({ emails_found: 1, inserted: 1 });
  downloadTaxReport.mockResolvedValue({
    blob: new Blob(['pdf']),
    filename: 'newbee-donations.pdf',
  });
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
});

test('renders stat tiles from ledger stats', async () => {
  render(<DonationLedger />);
  // $200.00 appears in the YTD tile and in Li Chen's table row
  expect((await screen.findAllByText('$200.00')).length).toBe(2);
  expect(screen.getByText('$1,000.00')).toBeInTheDocument();
  expect(screen.getByText(/2 donations · 2 donors/)).toBeInTheDocument();
  expect(screen.getByText(/Pending review 待审核/)).toBeInTheDocument();
  expect(screen.getByText(/Thank-you not sent 未致谢/)).toBeInTheDocument();
});

test('renders all donations with status chips and pending actions', async () => {
  render(<DonationLedger />);
  expect(await screen.findByText('Ming Zhao')).toBeInTheDocument();
  expect(screen.getByText('Li Chen')).toBeInTheDocument();
  expect(screen.getByText('Golden Wheat Bakery')).toBeInTheDocument();
  expect(screen.getByText('PENDING 待审核')).toBeInTheDocument();
  expect(screen.getByText('DISMISSED 已忽略')).toBeInTheDocument();
  expect(screen.getByText('Approve 确认')).toBeInTheDocument();
});

test('pending donations sort to the top and show source chips', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  const rows = screen.getAllByRole('row');
  // Header row, then pending Ming Zhao first
  expect(within(rows[1]).getByText('Ming Zhao')).toBeInTheDocument();
  expect(screen.getAllByText('✉ Gmail · Zelle').length).toBe(3);
  // Filter chip + one manual source chip
  expect(screen.getAllByText('Manual 手动').length).toBe(2);
});

test('thank-you column shows sent state and disabled placeholder', async () => {
  render(<DonationLedger />);
  await screen.findByText('Li Chen');
  expect(screen.getByText(/✓ Sent/)).toBeInTheDocument();
  const sendButton = screen.getByText('Send thank-you 发送感谢').closest('button');
  expect(sendButton).toBeDisabled();
});

test('filter chips narrow the table', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');

  fireEvent.click(screen.getByText('Pending 待审核'));
  expect(screen.getByText('Ming Zhao')).toBeInTheDocument();
  expect(screen.queryByText('Li Chen')).not.toBeInTheDocument();

  // First match is the toolbar filter chip (rendered before the table)
  fireEvent.click(screen.getAllByText('Manual 手动')[0]);
  expect(screen.getByText('Golden Wheat Bakery')).toBeInTheDocument();
  expect(screen.queryByText('Ming Zhao')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('All 全部'));
  expect(screen.getByText('Ming Zhao')).toBeInTheDocument();
});

test('expanding a row reveals the email excerpt and notes', async () => {
  render(<DonationLedger />);
  const row = (await screen.findByText('Ming Zhao')).closest('tr');
  fireEvent.click(row);
  expect(await screen.findByText(/Memo: Keep running!/)).toBeInTheDocument();
  expect(screen.getByText(/Zelle Transaction #23456789012/)).toBeInTheDocument();
});

test('approve sends corrections and refreshes the ledger', async () => {
  const onLedgerChange = jest.fn();
  render(<DonationLedger onLedgerChange={onLedgerChange} />);
  const row = (await screen.findByText('Ming Zhao')).closest('tr');

  // Change donor type in the expanded detail before approving
  fireEvent.click(row);
  fireEvent.mouseDown(await screen.findByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: /Enterprise 企业/ }));

  fireEvent.click(screen.getByText('Approve 确认'));
  await waitFor(() => expect(approveDonation).toHaveBeenCalledWith(
    10, { donor_type: 'enterprise' }, 'admin-uid'
  ));
  await waitFor(() => expect(onLedgerChange).toHaveBeenCalled());
  expect(getDonationLedger).toHaveBeenCalledTimes(2);
});

test('dismiss calls the API and refreshes', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByLabelText('Dismiss 忽略'));
  await waitFor(() => expect(dismissDonation).toHaveBeenCalledWith(10, 'admin-uid'));
  await waitFor(() => expect(getDonationLedger).toHaveBeenCalledTimes(2));
});

test('sync status line and Sync now button', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  expect(screen.getByText(/● Healthy/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Sync now 立即同步'));
  await waitFor(() => expect(runGmailSync).toHaveBeenCalledWith('admin-uid'));
  await waitFor(() => expect(getDonationLedger).toHaveBeenCalledTimes(2));
});

test('shows never-run sync state', async () => {
  getDonationLedger.mockResolvedValue({
    ...ledgerData,
    sync: { last_run: null, last_result: null, next_run: null },
  });
  render(<DonationLedger />);
  expect(await screen.findByText(/never run 尚未运行/)).toBeInTheDocument();
});

test('tax dialog generates and downloads a report', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');

  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  expect(await screen.findByText(/Time range 时间范围/)).toBeInTheDocument();

  // Default range is last tax year, PDF summary; preview counts confirmed only
  fireEvent.click(screen.getByText(`${currentYear} YTD 今年至今`));
  fireEvent.click(screen.getByText('CSV Detail 明细'));
  fireEvent.click(screen.getByText('⬇ Generate & Download 生成并下载'));

  await waitFor(() => expect(downloadTaxReport).toHaveBeenCalledWith(
    {
      startDate: `${currentYear}-01-01`,
      endDate: new Date().toISOString().split('T')[0],
      format: 'csv',
    },
    'admin-uid'
  ));
  await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());
  // Dialog closes after a successful download
  await waitFor(() =>
    expect(screen.queryByText(/Time range 时间范围/)).not.toBeInTheDocument()
  );
});

test('tax dialog preview counts confirmed donations in range', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  fireEvent.click(screen.getByText(`${currentYear} YTD 今年至今`));
  // Only Li Chen ($200 confirmed this year) — pending/dismissed excluded
  expect(await screen.findByText(/1 donations · \$200\.00 · 1 donors/)).toBeInTheDocument();
});

test('shows an error alert when the ledger fails to load', async () => {
  getDonationLedger.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  expect(await screen.findByText(/Failed to load donation ledger/)).toBeInTheDocument();
});

test('shows an error when approve fails', async () => {
  approveDonation.mockRejectedValue(new Error('nope'));
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Approve 确认'));
  expect(await screen.findByText(/Failed to approve donation/)).toBeInTheDocument();
});

test('shows an error when Gmail sync fails', async () => {
  runGmailSync.mockRejectedValue(new Error('503'));
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Sync now 立即同步'));
  expect(await screen.findByText(/Gmail sync failed/)).toBeInTheDocument();
});

test('shows an error when the tax download fails', async () => {
  downloadTaxReport.mockRejectedValue(new Error('500'));
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  fireEvent.click(screen.getByText('⬇ Generate & Download 生成并下载'));
  expect(await screen.findByText(/Failed to generate tax file/)).toBeInTheDocument();
});

test('renders nothing to fetch without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<DonationLedger />);
  expect(getDonationLedger).not.toHaveBeenCalled();
});
