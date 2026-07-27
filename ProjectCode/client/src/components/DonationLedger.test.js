import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DonationLedger from './DonationLedger';
import { useAuth } from '../context';
import {
  getDonationLedger,
  approveDonation,
  dismissDonation,
  sendThankYou,
  markThankYouSent,
  getThankYouPreview,
  getThankYouTemplates,
  createThankYouTemplate,
  updateThankYouTemplate,
  deleteThankYouTemplate,
  downloadReceipt,
  updateDonor,
  runGmailSync,
  downloadTaxReport,
} from '../api/donors';

jest.mock('../context', () => ({
  useAuth: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../api/donors', () => ({
  getDonationLedger: jest.fn(),
  approveDonation: jest.fn(),
  dismissDonation: jest.fn(),
  sendThankYou: jest.fn(),
  markThankYouSent: jest.fn(),
  getThankYouPreview: jest.fn(),
  getThankYouTemplates: jest.fn(),
  createThankYouTemplate: jest.fn(),
  updateThankYouTemplate: jest.fn(),
  deleteThankYouTemplate: jest.fn(),
  downloadReceipt: jest.fn(),
  updateDonor: jest.fn(),
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
      email_excerpt: 'Zelle payment received — Spam Sender sent you $5.00 · Memo: carpool',
      message: 'carpool',
      notes: "Zelle Transaction #1 · Auto-ignored 自动忽略: memo matched 'carpool'",
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
  sendThankYou.mockResolvedValue({});
  markThankYouSent.mockResolvedValue({});
  getThankYouPreview.mockResolvedValue({
    subject: 'Thank you for supporting NewBee Running Club!',
    body: 'Dear donor, thank you for your generous donation.',
    template_name: null,
    template_id: 0,
  });
  getThankYouTemplates.mockResolvedValue([]);
  createThankYouTemplate.mockResolvedValue({});
  updateThankYouTemplate.mockResolvedValue({});
  deleteThankYouTemplate.mockResolvedValue({});
  downloadReceipt.mockResolvedValue({
    blob: new Blob(['pdf']),
    filename: 'NewBee_Donation_Receipt_20260604_Yue_Ma.pdf',
  });
  updateDonor.mockResolvedValue({});
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

test('main table shows pending and approved rows; ignored ones move to the section', async () => {
  render(<DonationLedger />);
  expect(await screen.findByText('Ming Zhao')).toBeInTheDocument();
  expect(screen.getByText('Li Chen')).toBeInTheDocument();
  expect(screen.getByText('Golden Wheat Bakery')).toBeInTheDocument();
  expect(screen.getByText('PENDING 待审核')).toBeInTheDocument();
  // Ignored row is out of the main table, inside the collapsed section
  expect(screen.queryByText('Spam Sender')).not.toBeInTheDocument();
  const sectionHeader = screen.getByText('Ignored 已忽略').closest('div');
  expect(within(sectionHeader).getByText('1')).toBeInTheDocument(); // count chip
  // Only the pending row has an Approve button in the main table
  expect(screen.getAllByText('Approve 确认')).toHaveLength(1);
});

test('ignored section expands to show rows with an AUTO badge and Restore', async () => {
  const onLedgerChange = jest.fn();
  render(<DonationLedger onLedgerChange={onLedgerChange} />);
  await screen.findByText('Ming Zhao');

  fireEvent.click(screen.getByText('Ignored 已忽略'));
  expect(await screen.findByText('Spam Sender')).toBeInTheDocument();
  expect(screen.getByText('AUTO')).toBeInTheDocument();
  expect(screen.getByText(/memo matched 'carpool'/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Restore 恢复为已确认'));
  await waitFor(() => expect(approveDonation).toHaveBeenCalledWith(13, {}, 'admin-uid'));
  await waitFor(() => expect(onLedgerChange).toHaveBeenCalled());
});

test('pending donations sort to the top and show source chips', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  const rows = screen.getAllByRole('row');
  // Header row, then pending Ming Zhao first
  expect(within(rows[1]).getByText('Ming Zhao')).toBeInTheDocument();
  // Ming Zhao + Li Chen (ignored Spam Sender is in the collapsed section)
  expect(screen.getAllByText('✉ Gmail · Zelle').length).toBe(2);
  // Filter chip + one manual source chip
  expect(screen.getAllByText('Manual 手动').length).toBe(2);
});

test('Venmo-imported donations show a Venmo source chip', async () => {
  getDonationLedger.mockResolvedValue({
    ...ledgerData,
    donations: [{
      donation_id: 20,
      donor_id: 'IND_20',
      name: 'Xiao Yang',
      donor_type: 'individual',
      amount: '15.00',
      donation_date: `${currentYear}-07-05`,
      source: 'Venmo (Xiao Yang)',
      receipt_confirmed: true,
      status: 'pending',
      email_excerpt: 'Venmo payment received — Xiao Yang sent you $15.00 · Memo: 加油',
    }],
  });
  render(<DonationLedger />);
  expect(await screen.findByText('Xiao Yang')).toBeInTheDocument();
  expect(screen.getByText('✉ Gmail · Venmo')).toBeInTheDocument();
});

test('manual entries with a payment-app source name still show as Manual', async () => {
  getDonationLedger.mockResolvedValue({
    ...ledgerData,
    donations: [{
      donation_id: 21,
      donor_id: 'IND_21',
      name: 'Wei Zhang',
      donor_type: 'individual',
      amount: '120.00',
      donation_date: `${currentYear}-05-10`,
      source: 'Venmo',           // manually entered, no email excerpt
      receipt_confirmed: true,
      status: 'confirmed',
    }],
  });
  render(<DonationLedger />);
  await screen.findByText('Wei Zhang');
  // Filter chip + the row's source chip
  expect(screen.getAllByText('Manual 手动').length).toBe(2);
  expect(screen.queryByText(/✉ Gmail/)).not.toBeInTheDocument();
});

test('thank-you column shows sent state or an enabled send button', async () => {
  render(<DonationLedger />);
  await screen.findByText('Li Chen');
  expect(screen.getByText(/✓ Sent/)).toBeInTheDocument();
  const sendButton = screen.getByText('Send thank-you 发送感谢').closest('button');
  expect(sendButton).toBeEnabled();
});

test('the "Already sent" button marks a donation as thanked without opening the send dialog', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');

  fireEvent.click(screen.getByText('Already sent 已发送'));
  await waitFor(() => expect(markThankYouSent).toHaveBeenCalledWith(12, undefined, 'admin-uid'));
  expect(screen.queryByText('✉ Send thank-you email 发送感谢邮件')).not.toBeInTheDocument();
  await waitFor(() => expect(getDonationLedger).toHaveBeenCalledTimes(2));
});

test('shows an error when marking a donation as already-thanked fails', async () => {
  markThankYouSent.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');

  fireEvent.click(screen.getByText('Already sent 已发送'));
  expect(await screen.findByText('Failed to mark as already thanked. / 标记为已致谢失败。')).toBeInTheDocument();
});

test('send dialog prefills the matched letter and sends the edited version', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');

  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  expect(await screen.findByText('✉ Send thank-you email 发送感谢邮件')).toBeInTheDocument();
  await waitFor(() => expect(getThankYouPreview).toHaveBeenCalledWith(12, 'admin-uid'));

  // Prefilled from the preview; built-in default badge shown
  expect(await screen.findByDisplayValue(/Dear donor, thank you/)).toBeInTheDocument();
  expect(screen.getByText('Built-in default 内置模板')).toBeInTheDocument();

  // Send is disabled until a plausible email is entered
  const sendBtn = screen.getByText('Send 发送').closest('button');
  expect(sendBtn).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Donor email 捐赠者邮箱/), {
    target: { value: 'baker@example.com' },
  });
  expect(sendBtn).toBeEnabled();

  // Edit the letter before sending
  fireEvent.change(screen.getByLabelText(/Subject 邮件标题/), {
    target: { value: 'Edited subject line' },
  });
  fireEvent.change(screen.getByLabelText(/Message 正文/), {
    target: { value: 'Edited letter body' },
  });

  fireEvent.click(sendBtn);
  await waitFor(() => expect(sendThankYou).toHaveBeenCalledWith(12, {
    email: 'baker@example.com',
    subject: 'Edited subject line',
    message: 'Edited letter body',
    attachReceipt: true,
  }, 'admin-uid'));
  await waitFor(() =>
    expect(screen.queryByText('✉ Send thank-you email 发送感谢邮件')).not.toBeInTheDocument()
  );
  expect(getDonationLedger).toHaveBeenCalledTimes(2);
});

test('switching templates in the send dialog refills the letter', async () => {
  getThankYouTemplates.mockResolvedValue([
    { id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' },
  ]);
  getThankYouPreview
    .mockResolvedValueOnce({
      subject: 'Auto subject', body: 'Auto body', template_name: null, template_id: 0,
    })
    .mockResolvedValueOnce({
      subject: 'Major subject', body: 'Major body for Golden Wheat',
      template_name: 'Major donor', template_id: 5,
    });

  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByDisplayValue('Auto body');

  fireEvent.mouseDown(screen.getByLabelText('Template 模板').closest('[role="combobox"]') || screen.getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByText(/Major donor · ≥ \$300\.00/));

  await waitFor(() => expect(getThankYouPreview).toHaveBeenCalledWith(12, 'admin-uid', 5));
  expect(await screen.findByDisplayValue('Major body for Golden Wheat')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Major subject')).toBeInTheDocument();
});

test('attach-receipt checkbox can be unchecked before sending', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByText('✉ Send thank-you email 发送感谢邮件');
  await screen.findByDisplayValue(/Dear donor, thank you/); // preview loaded

  fireEvent.click(screen.getByLabelText(/Attach donation receipt/));
  fireEvent.change(screen.getByLabelText(/Donor email 捐赠者邮箱/), {
    target: { value: 'baker@example.com' },
  });
  fireEvent.click(screen.getByText('Send 发送'));
  await waitFor(() => expect(sendThankYou).toHaveBeenCalledWith(
    12, expect.objectContaining({ attachReceipt: false }), 'admin-uid'
  ));
});

test('receipt download button generates the PDF for reviewed rows', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  // Li Chen + Golden Wheat (approved) — pending Ming Zhao has no receipt button
  const buttons = screen.getAllByLabelText('Receipt 收据');
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(downloadReceipt).toHaveBeenCalledWith(11, 'admin-uid'));
  await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());
});

test('templates dialog lists, adds, and deletes templates', async () => {
  getThankYouTemplates
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' }]);
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');

  fireEvent.click(screen.getByText('✉ Templates 模板'));
  expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('＋ Add template 添加模板'));
  fireEvent.change(screen.getByLabelText(/Template name 模板名称/), { target: { value: 'Major donor' } });
  fireEvent.change(screen.getByLabelText(/Applies from/), { target: { value: '300' } });
  fireEvent.change(screen.getByLabelText(/Subject 邮件标题/), { target: { value: 'S' } });
  fireEvent.change(screen.getByLabelText(/Body 正文/), { target: { value: 'B' } });
  fireEvent.click(screen.getByText('Save 保存'));

  await waitFor(() => expect(createThankYouTemplate).toHaveBeenCalledWith(
    { name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' }, 'admin-uid'
  ));
  // Refreshed list shows the new template with its tier
  expect(await screen.findByText('≥ $300.00')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Delete 删除'));
  await waitFor(() => expect(deleteThankYouTemplate).toHaveBeenCalledWith(5, 'admin-uid'));
});

test('notes can be edited and saved from the expanded row', async () => {
  render(<DonationLedger />);
  const row = (await screen.findByText('Ming Zhao')).closest('tr');
  fireEvent.click(row);
  fireEvent.click(await screen.findByText('✎ Edit 编辑'));

  const field = screen.getByLabelText('Notes 备注');
  fireEvent.change(field, { target: { value: 'Zelle Transaction #23456789012\nBoard follow-up in Q3' } });
  fireEvent.click(screen.getByText('Save 保存'));

  await waitFor(() => expect(updateDonor).toHaveBeenCalledWith(
    'IND_10', { notes: 'Zelle Transaction #23456789012\nBoard follow-up in Q3' }, 'admin-uid'
  ));
  await waitFor(() => expect(getDonationLedger).toHaveBeenCalledTimes(2));
});

test('shows an error when the thank-you email fails to send', async () => {
  sendThankYou.mockRejectedValue(new Error('smtp down'));
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByDisplayValue(/Dear donor, thank you/); // preview loaded
  fireEvent.change(await screen.findByLabelText(/Donor email 捐赠者邮箱/), {
    target: { value: 'baker@example.com' },
  });
  fireEvent.click(screen.getByText('Send 发送'));
  expect(await screen.findByText(/Failed to send the thank-you email/)).toBeInTheDocument();
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

  // First Approve belongs to the pending row (sorted to the top)
  fireEvent.click(screen.getAllByText('Approve 确认')[0]);
  await waitFor(() => expect(approveDonation).toHaveBeenCalledWith(
    10, { donor_type: 'enterprise' }, 'admin-uid'
  ));
  await waitFor(() => expect(onLedgerChange).toHaveBeenCalled());
  expect(getDonationLedger).toHaveBeenCalledTimes(2);
});

test('ignoring a pending row calls the API and refreshes', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  // First Ignore button belongs to the pending row (sorted to the top)
  fireEvent.click(screen.getAllByText('Ignore 忽略')[0]);
  await waitFor(() => expect(dismissDonation).toHaveBeenCalledWith(10, 'admin-uid'));
  await waitFor(() => expect(getDonationLedger).toHaveBeenCalledTimes(2));
});

test('every row offers Ignore; delete is never offered', async () => {
  render(<DonationLedger />);
  await screen.findByText('Li Chen');
  // Pending row + 2 approved rows each have an Ignore action
  expect(screen.getAllByText('Ignore 忽略')).toHaveLength(3);
  expect(screen.queryByLabelText('Delete 删除')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Un-approve 撤回')).not.toBeInTheDocument();
});

test('ignoring an approved row moves it to the ignored section', async () => {
  const onLedgerChange = jest.fn();
  render(<DonationLedger onLedgerChange={onLedgerChange} />);
  await screen.findByText('Li Chen');
  // Rows sort pending-first: index 0 = pending Ming Zhao, 1 = Li Chen
  fireEvent.click(screen.getAllByText('Ignore 忽略')[1]);
  await waitFor(() => expect(dismissDonation).toHaveBeenCalledWith(11, 'admin-uid'));
  await waitFor(() => expect(onLedgerChange).toHaveBeenCalled());
  expect(getDonationLedger).toHaveBeenCalledTimes(2);
});

test('shows an error when ignore fails', async () => {
  dismissDonation.mockRejectedValue(new Error('nope'));
  render(<DonationLedger />);
  await screen.findByText('Li Chen');
  fireEvent.click(screen.getAllByText('Ignore 忽略')[1]);
  expect(await screen.findByText(/Failed to dismiss donation/)).toBeInTheDocument();
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
  fireEvent.click(screen.getAllByText('Approve 确认')[0]);
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

test('cancel closes the send thank-you dialog without sending', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByText('✉ Send thank-you email 发送感谢邮件');
  await screen.findByDisplayValue(/Dear donor, thank you/); // preview loaded

  fireEvent.click(screen.getByText('Cancel 取消'));
  await waitFor(() =>
    expect(screen.queryByText('✉ Send thank-you email 发送感谢邮件')).not.toBeInTheDocument()
  );
  expect(sendThankYou).not.toHaveBeenCalled();
});

test('shows an error when the letter preview fails to load', async () => {
  getThankYouPreview.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  expect(await screen.findByText('Failed to load the letter preview. / 加载感谢信预览失败。')).toBeInTheDocument();
});

test('shows an error when switching templates fails', async () => {
  getThankYouTemplates.mockResolvedValue([
    { id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' },
  ]);
  getThankYouPreview
    .mockResolvedValueOnce({
      subject: 'Auto subject', body: 'Auto body', template_name: null, template_id: 0,
    })
    .mockRejectedValueOnce(new Error('boom'));

  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByDisplayValue('Auto body');

  fireEvent.mouseDown(screen.getByLabelText('Template 模板').closest('[role="combobox"]') || screen.getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByText(/Major donor · ≥ \$300\.00/));

  expect(await screen.findByText('Failed to load that template. / 切换模板失败。')).toBeInTheDocument();
});

test('shows an error when the receipt download fails', async () => {
  downloadReceipt.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getAllByLabelText('Receipt 收据')[0]);
  expect(await screen.findByText('Failed to generate the receipt. / 生成收据失败。')).toBeInTheDocument();
});

test('close button closes the templates dialog', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  await screen.findByText('✉ Thank-you templates 感谢信模板');
  fireEvent.click(screen.getByText('Close 关闭'));
  await waitFor(() =>
    expect(screen.queryByText('✉ Thank-you templates 感谢信模板')).not.toBeInTheDocument()
  );
});

test('shows an error when the templates list fails to load', async () => {
  getThankYouTemplates.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  expect(await screen.findByText('Failed to load templates. / 加载模板失败。')).toBeInTheDocument();
});

test('edit button opens the template form pre-filled; cancel discards it', async () => {
  getThankYouTemplates.mockResolvedValue([
    { id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' },
  ]);
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  fireEvent.click(await screen.findByText('✎ Edit 编辑'));
  expect(screen.getByDisplayValue('Major donor')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Cancel 取消'));
  expect(screen.queryByDisplayValue('Major donor')).not.toBeInTheDocument();
});

test('editing an existing template saves via update, not create', async () => {
  getThankYouTemplates.mockResolvedValue([
    { id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' },
  ]);
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  fireEvent.click(await screen.findByText('✎ Edit 编辑'));

  fireEvent.change(screen.getByLabelText(/Template name 模板名称/), { target: { value: 'Major donor v2' } });
  fireEvent.click(screen.getByText('Save 保存'));

  await waitFor(() => expect(updateThankYouTemplate).toHaveBeenCalledWith(
    5, { name: 'Major donor v2', min_amount: '300', subject: 'S', body: 'B' }, 'admin-uid'
  ));
  expect(createThankYouTemplate).not.toHaveBeenCalled();
});

test('shows an error when saving a template fails', async () => {
  createThankYouTemplate.mockRejectedValue(new Error('boom'));
  getThankYouTemplates.mockResolvedValue([]);
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  fireEvent.click(await screen.findByText('＋ Add template 添加模板'));
  fireEvent.change(screen.getByLabelText(/Template name 模板名称/), { target: { value: 'Major donor' } });
  fireEvent.change(screen.getByLabelText(/Subject 邮件标题/), { target: { value: 'S' } });
  fireEvent.change(screen.getByLabelText(/Body 正文/), { target: { value: 'B' } });
  fireEvent.click(screen.getByText('Save 保存'));
  expect(await screen.findByText('Failed to save the template. / 保存模板失败。')).toBeInTheDocument();
});

test('shows an error when deleting a template fails', async () => {
  deleteThankYouTemplate.mockRejectedValue(new Error('boom'));
  getThankYouTemplates.mockResolvedValue([
    { id: 5, name: 'Major donor', min_amount: '300', subject: 'S', body: 'B' },
  ]);
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  fireEvent.click(await screen.findByText('Delete 删除'));
  expect(await screen.findByText('Failed to delete the template. / 删除模板失败。')).toBeInTheDocument();
});

test('cancel discards notes edits without saving', async () => {
  render(<DonationLedger />);
  const row = (await screen.findByText('Ming Zhao')).closest('tr');
  fireEvent.click(row);
  fireEvent.click(await screen.findByText('✎ Edit 编辑'));
  fireEvent.change(screen.getByLabelText('Notes 备注'), { target: { value: 'draft that should be discarded' } });
  fireEvent.click(screen.getByText('Cancel 取消'));
  expect(screen.queryByLabelText('Notes 备注')).not.toBeInTheDocument();
  expect(updateDonor).not.toHaveBeenCalled();
});

test('shows an error when saving notes fails', async () => {
  updateDonor.mockRejectedValue(new Error('boom'));
  render(<DonationLedger />);
  const row = (await screen.findByText('Ming Zhao')).closest('tr');
  fireEvent.click(row);
  fireEvent.click(await screen.findByText('✎ Edit 编辑'));
  fireEvent.change(screen.getByLabelText('Notes 备注'), { target: { value: 'updated note' } });
  fireEvent.click(screen.getByText('Save 保存'));
  expect(await screen.findByText('Failed to save notes. / 保存备注失败。')).toBeInTheDocument();
});

test('editing the tax date range updates the from/to fields', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  await screen.findByText(/Time range 时间范围/);

  fireEvent.change(screen.getByLabelText('From 从'), { target: { value: `${currentYear - 3}-02-01` } });
  fireEvent.change(screen.getByLabelText('To 至'), { target: { value: `${currentYear - 3}-02-28` } });
  fireEvent.click(screen.getByText('⬇ Generate & Download 生成并下载'));

  await waitFor(() => expect(downloadTaxReport).toHaveBeenCalledWith(
    { startDate: `${currentYear - 3}-02-01`, endDate: `${currentYear - 3}-02-28`, format: 'pdf' },
    'admin-uid'
  ));
});

test('cancel closes the tax dialog without generating a report', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  await screen.findByText(/Time range 时间范围/);

  fireEvent.click(screen.getByText('Cancel 取消'));
  await waitFor(() => expect(screen.queryByText(/Time range 时间范围/)).not.toBeInTheDocument());
  expect(downloadTaxReport).not.toHaveBeenCalled();
});

test('the error alert can be dismissed', async () => {
  approveDonation.mockRejectedValue(new Error('nope'));
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getAllByText('Approve 确认')[0]);
  expect(await screen.findByText(/Failed to approve donation/)).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Close'));
  expect(screen.queryByText(/Failed to approve donation/)).not.toBeInTheDocument();
});

test('pressing Escape closes the send thank-you dialog', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('Send thank-you 发送感谢'));
  await screen.findByText('✉ Send thank-you email 发送感谢邮件');

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByText('✉ Send thank-you email 发送感谢邮件')).not.toBeInTheDocument()
  );
});

test('pressing Escape closes the templates dialog', async () => {
  render(<DonationLedger />);
  await screen.findByText('Golden Wheat Bakery');
  fireEvent.click(screen.getByText('✉ Templates 模板'));
  await screen.findByText('✉ Thank-you templates 感谢信模板');

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByText('✉ Thank-you templates 感谢信模板')).not.toBeInTheDocument()
  );
});

test('pressing Escape closes the tax dialog', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('Generate Tax File 生成税务文件'));
  await screen.findByText(/Time range 时间范围/);

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByText(/Time range 时间范围/)).not.toBeInTheDocument());
});

test('renders nothing to fetch without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<DonationLedger />);
  expect(getDonationLedger).not.toHaveBeenCalled();
});

test('links to the finance workbench', async () => {
  render(<DonationLedger />);
  await screen.findByText('Ming Zhao');
  fireEvent.click(screen.getByText('📚 Finance 财务工作台 →'));
  expect(mockNavigate).toHaveBeenCalledWith('/finance');
});
