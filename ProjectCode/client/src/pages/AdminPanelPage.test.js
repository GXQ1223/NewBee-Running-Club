import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPanelPage from './AdminPanelPage';
import * as membersApi from '../api/members';
import * as eventsApi from '../api/events';
import * as donorsApi from '../api/donors';
import * as bannersApi from '../api/banners';
import * as sectionsApi from '../api/homepageSections';
import * as activitiesApi from '../api/activities';
import * as settingsApi from '../api/settings';
import { committeeMembers } from '../data/committeeMembers';

jest.mock('../api/members');
jest.mock('../api/events');
jest.mock('../api/donors');
jest.mock('../api/banners');
jest.mock('../api/homepageSections');
jest.mock('../api/activities');
jest.mock('../api/settings');

const mockUseAuth = jest.fn();
jest.mock('../context/AuthContext', () => ({
  __esModule: true,
  useAuth: () => mockUseAuth(),
}));

jest.mock('../context', () => {
  const refreshLinks = jest.fn();
  return {
    __esModule: true,
    useSocialLinks: () => ({ refreshLinks }),
    __mockRefreshLinks: refreshLinks,
  };
});
const { __mockRefreshLinks: mockRefreshLinks } = jest.requireMock('../context');

jest.mock('../components/MeetingMinutesEditor', () => ({
  __esModule: true,
  default: ({ firebaseUid }) => {
    const ReactLocal = require('react');
    return ReactLocal.createElement(
      'div',
      { 'data-testid': 'meeting-minutes-editor' },
      `uid:${firebaseUid}`
    );
  },
}));

const ADMIN_UID = 'admin-uid';
const adminUser = { uid: ADMIN_UID, displayName: 'Admin', email: 'a@b.c' };

const mkMember = (id, overrides = {}) => ({
  id,
  username: `user${id}`,
  email: `user${id}@x.com`,
  status: 'runner',
  created_at: '2026-01-05T00:00:00Z',
  ...overrides,
});

const allMembersFixture = [
  mkMember(100, { display_name: 'Admin', email: 'a@b.c', status: 'admin', gender: 'M', join_date: '2024-01-01' }),
  mkMember(101, { display_name: 'Cathy Committee', status: 'committee', gender: 'F' }),
  mkMember(102, { display_name: 'Runner A', display_name_cn: '甲', gender: 'M', birth_year: 1990, email: 'runnera@x.com' }),
  mkMember(103, { display_name: 'Runner B', gender: 'F' }),
  mkMember(104, {}), // no display_name -> username fallback
  mkMember(105, { display_name: 'Runner D' }),
  mkMember(106, { display_name: 'Runner E' }),
  mkMember(107, { display_name: 'Runner F' }),
  mkMember(108, { display_name: 'Runner G' }),
  mkMember(109, { display_name: 'Runner H', created_at: null }), // joined N/A
  mkMember(110, { display_name: 'Pat Pending', status: 'pending' }),
  mkMember(111, { display_name: 'Ray Rejected', status: 'rejected' }),
  mkMember(112, { display_name: 'Sue Suspended', status: 'suspended' }),
  mkMember(113, { display_name: 'Quinn Quit', status: 'quit' }),
];

const pendingFixture = [
  { id: 1, display_name: 'Pending Pete', email: 'pete@x.com', nyrr_member_id: 'NYRR-1', created_at: '2026-07-01T00:00:00Z' },
  { id: 2, username: 'petra', email: 'petra@x.com', created_at: '2026-07-02T00:00:00Z' },
];

const eventsFixture = [
  { id: 10, name: 'Spring Run', chinese_name: '春跑', date: '2026-05-01', time: '8:00 AM', location: 'Central Park', status: 'Upcoming', is_highlight: false },
  { id: 11, name: 'Legacy Gala', date: '2025-01-01', status: 'Highlight' }, // legacy status, no location -> TBD
  { id: 12, name: 'Winter Past', date: '2025-12-01', status: 'Past', is_highlight: true },
  { id: 13, name: 'Cancelled Run', date: '2026-02-01', status: 'Cancelled' },
];

const donationFixture = [
  { donor_type: 'individual', total_amount: '1000', donor_count: 3 },
  { donor_type: 'enterprise', total_amount: '2500', donor_count: 2 },
];

const bannersFixture = [
  { id: 20, image_url: '/b1.jpg', alt_text: 'B1', label_en: 'Banner One', label_cn: '横幅一', link_path: '/about', display_order: 0, is_active: true },
  { id: 21, image_url: '/b2.jpg', display_order: 1, is_active: false }, // no labels/link
];

const sectionsFixture = [
  { id: 30, title_en: 'Section One', title_cn: '板块一', image_url: '/s1.jpg', link_path: '/join', display_order: 0, is_active: true },
  { id: 31, title_en: '', image_url: '', link_path: '/gallery', display_order: 1, is_active: false }, // no image, no title
];

const activitiesFixture = [
  { id: 40, member_id: 102, activity_number: 1, event_name: 'Group Run', event_date: '2026-06-01', created_at: '2026-06-02T00:00:00Z', description: 'Fun run', proof_url: 'https://proof.example' },
  { id: 41, member_id: 999, activity_number: 2, event_name: 'Solo Run', event_date: '2026-06-03' }, // unknown member, no created_at
];

const memberActivitiesFixture = [
  { id: 40, activity_number: 1, status: 'pending' },
  { id: 39, activity_number: 2, status: 'verified' },
  { id: 38, activity_number: 3, status: 'rejected' },
];

const socialSettingsFixture = [
  { key: 'social_instagram', value: 'https://insta' },
  { key: 'social_xiaohongshu', value: 'https://xhs' },
  { key: 'social_heylo', value: null }, // covers `value || ''`
  { key: 'social_shop', value: 'https://shop' },
  { key: 'social_shop_demo_video', value: 'https://video' },
];

const joinSettingsFixture = [
  { key: 'join_min_english_words', value: '100' },
  { key: 'join_min_chinese_chars', value: '200' },
];

const renderPage = (initialEntry = '/admin') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminPanelPage />
    </MemoryRouter>
  );

const waitForDashboard = async () => screen.findByText('Admin Dashboard');

const openTab = (name) => {
  fireEvent.click(screen.getByRole('tab', { name }));
};

// First table on the page -> body rows (skips the header row)
const getBodyRows = () =>
  within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);

const selectMuiOption = (combobox, optionName) => {
  fireEvent.mouseDown(combobox);
  const listbox = screen.getByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ currentUser: adminUser, loading: false });
  membersApi.getMemberByFirebaseUid.mockResolvedValue({ id: 100, status: 'admin', display_name: 'Admin', username: 'admin' });
  membersApi.getPendingMembers.mockResolvedValue(pendingFixture);
  membersApi.getAllMembers.mockResolvedValue(allMembersFixture);
  membersApi.approveMember.mockResolvedValue({});
  membersApi.rejectMember.mockResolvedValue({});
  membersApi.updateMember.mockResolvedValue({});
  membersApi.promoteToCommittee.mockResolvedValue({});
  membersApi.demoteFromCommittee.mockResolvedValue({});
  eventsApi.getAllEvents.mockResolvedValue(eventsFixture);
  eventsApi.createEvent.mockResolvedValue({ id: 99, name: 'Brand New Run', date: '2026-07-10', status: 'Past', is_highlight: true });
  eventsApi.updateEvent.mockResolvedValue({ id: 11, name: 'Legacy Gala Updated', date: '2025-01-01', status: 'Past', is_highlight: true });
  eventsApi.deleteEvent.mockResolvedValue({});
  donorsApi.getDonationSummary.mockResolvedValue(donationFixture);
  bannersApi.getAllBanners.mockResolvedValue(bannersFixture);
  bannersApi.createBanner.mockResolvedValue({ id: 22, image_url: '/new.jpg', label_en: 'New Banner', display_order: 2, is_active: false });
  bannersApi.updateBanner.mockResolvedValue({ id: 20, image_url: '/b1.jpg', label_en: 'Banner One Updated', link_path: '/about', display_order: 0, is_active: true });
  bannersApi.deleteBanner.mockResolvedValue({});
  sectionsApi.getAllSections.mockResolvedValue(sectionsFixture);
  sectionsApi.createSection.mockResolvedValue({ id: 32, title_en: 'New Section', link_path: '/new', display_order: 2, is_active: true });
  sectionsApi.updateSection.mockResolvedValue({ id: 30, title_en: 'Section One Updated', image_url: '/s1.jpg', link_path: '/join', display_order: 0, is_active: true });
  sectionsApi.deleteSection.mockResolvedValue({});
  activitiesApi.getPendingActivities.mockResolvedValue(activitiesFixture);
  activitiesApi.getMemberActivities.mockResolvedValue(memberActivitiesFixture);
  activitiesApi.verifyActivity.mockResolvedValue({});
  settingsApi.getSettingsByCategory.mockImplementation((category) =>
    Promise.resolve(category === 'social' ? socialSettingsFixture : joinSettingsFixture)
  );
  settingsApi.updateSetting.mockResolvedValue({});
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sent: 5, failed: 0, total: 5 }),
  });
});

describe('access control', () => {
  test('shows login prompt when not authenticated', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, loading: false });
    renderPage();
    expect(screen.getByText(/Please log in to access the admin panel/)).toBeInTheDocument();
    expect(membersApi.getMemberByFirebaseUid).not.toHaveBeenCalled();
  });

  test('shows access denied for a plain runner', async () => {
    membersApi.getMemberByFirebaseUid.mockResolvedValue({ id: 5, status: 'runner', display_name: 'Random Guy', username: 'random' });
    renderPage();
    expect(await screen.findByText(/Access Denied/)).toBeInTheDocument();
    expect(membersApi.getPendingMembers).not.toHaveBeenCalled();
  });

  test('shows access denied when member lookup fails', async () => {
    membersApi.getMemberByFirebaseUid.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText(/Access Denied/)).toBeInTheDocument();
  });

  test('committee member sees committee dashboard without admin-only tab', async () => {
    membersApi.getMemberByFirebaseUid.mockResolvedValue({ id: 101, status: 'committee', display_name: 'Cathy Committee', username: 'cathy' });
    renderPage();
    expect(await screen.findByText('Committee Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Committee Mgmt' })).not.toBeInTheDocument();
  });

  test('grants access via the static committee name list', async () => {
    membersApi.getMemberByFirebaseUid.mockResolvedValue({
      id: 7,
      status: 'runner',
      display_name: committeeMembers[0].name,
      username: 'listed',
    });
    renderPage();
    expect(await screen.findByText('Committee Dashboard')).toBeInTheDocument();
  });
});

describe('data loading', () => {
  test('renders dashboard with pending applications and members table', async () => {
    renderPage();
    await waitForDashboard();

    // Pending application cards
    expect(screen.getByText('Pending Applications (2)')).toBeInTheDocument();
    expect(screen.getByText('Pending Pete')).toBeInTheDocument();
    expect(screen.getByText('petra')).toBeInTheDocument(); // username fallback
    expect(screen.getByText('NYRR-1')).toBeInTheDocument();

    // All members table (10 active + 2 pending shown in header)
    expect(screen.getByText('All Members (10) + Pending (2)')).toBeInTheDocument();
    expect(screen.getByText('user104')).toBeInTheDocument(); // username fallback row
    expect(screen.getByText('甲')).toBeInTheDocument(); // CN name sub-line

    // Activities tab label shows the pending count
    expect(screen.getByRole('tab', { name: 'Activities (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Committee Mgmt' })).toBeInTheDocument();
  });

  test('falls back to empty data when individual fetchers reject', async () => {
    membersApi.getPendingMembers.mockRejectedValue(new Error('nope'));
    membersApi.getAllMembers.mockRejectedValue(new Error('nope'));
    eventsApi.getAllEvents.mockRejectedValue(new Error('nope'));
    donorsApi.getDonationSummary.mockRejectedValue(new Error('nope'));
    bannersApi.getAllBanners.mockRejectedValue(new Error('nope'));
    sectionsApi.getAllSections.mockRejectedValue(new Error('nope'));
    activitiesApi.getPendingActivities.mockRejectedValue(new Error('nope'));

    renderPage();
    await waitForDashboard();
    expect(screen.getByText('Pending Applications (0)')).toBeInTheDocument();
    expect(screen.getByText('All Members (0) + Pending (0)')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load admin data/)).not.toBeInTheDocument();
  });

  test('shows error alert when admin data fetch blows up, and it can be dismissed', async () => {
    // getAllEvents().catch(...) throws synchronously when the mock returns undefined,
    // driving the outer try/catch in fetchAdminData.
    eventsApi.getAllEvents.mockReturnValueOnce(undefined);
    renderPage();
    const alert = await screen.findByText('Failed to load admin data. Please try again.');
    expect(alert).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText('Failed to load admin data. Please try again.')).not.toBeInTheDocument();
    });
  });
});

describe('pending applications', () => {
  test('approves a pending member via the confirm dialog', async () => {
    renderPage();
    await waitForDashboard();

    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    expect(await screen.findByText('Approve Application?')).toBeInTheDocument();
    expect(screen.getByText(/approve Pending Pete's application/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(membersApi.approveMember).toHaveBeenCalledWith(1, ADMIN_UID));
    expect(await screen.findByText('Successfully approved Pending Pete!')).toBeInTheDocument();
    expect(screen.queryByText('Pending Pete')).not.toBeInTheDocument();

    // Wait for the dialog to fully unmount (it aria-hides the rest of the page
    // while transitioning out), then dismiss the success alert.
    await waitFor(() => expect(screen.queryByText('Approve Application?')).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByText('Successfully approved Pending Pete!')).not.toBeInTheDocument();
    });
  });

  test('shows error when approval fails', async () => {
    membersApi.approveMember.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();

    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Failed to complete action. Please try again.')).toBeInTheDocument();
  });

  test('rejects a pending member with a reason (after cancelling once)', async () => {
    renderPage();
    await waitForDashboard();

    // Open + cancel
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    expect(await screen.findByText(/Reject Application/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel / 取消' }));
    await waitFor(() => expect(screen.queryByLabelText(/Rejection Reason/)).not.toBeInTheDocument());

    // Re-open and submit
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    const reasonField = await screen.findByLabelText(/Rejection Reason/);
    const submit = screen.getByRole('button', { name: 'Reject / 拒绝' });
    expect(submit).toBeDisabled(); // empty reason
    fireEvent.change(reasonField, { target: { value: '  Too new  ' } });
    fireEvent.click(submit);

    await waitFor(() => expect(membersApi.rejectMember).toHaveBeenCalledWith(1, ADMIN_UID, 'Too new'));
    expect(await screen.findByText(/Successfully rejected Pending Pete's application/)).toBeInTheDocument();
    expect(screen.queryByText('Pending Pete')).not.toBeInTheDocument();
  });

  test('shows error when rejection fails', async () => {
    membersApi.rejectMember.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();

    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    fireEvent.change(await screen.findByLabelText(/Rejection Reason/), { target: { value: 'reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject / 拒绝' }));
    expect(await screen.findByText('Failed to reject member. Please try again.')).toBeInTheDocument();
  });
});

describe('members table', () => {
  test('filters members by search text', async () => {
    renderPage();
    await waitForDashboard();

    const search = screen.getByPlaceholderText(/Search by name or email/);
    fireEvent.change(search, { target: { value: 'runner a' } });
    expect(screen.getByText('Runner A')).toBeInTheDocument();
    expect(screen.queryByText('Runner B')).not.toBeInTheDocument();

    // Search by email
    fireEvent.change(search, { target: { value: 'user104@x.com' } });
    expect(screen.getByText('user104')).toBeInTheDocument();
    expect(screen.queryByText('Runner A')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByText('Runner A')).toBeInTheDocument();
  });

  test('sorts members by each column', async () => {
    renderPage();
    await waitForDashboard();

    const firstRowText = () => getBodyRows()[0].textContent;

    // Name asc, then desc
    fireEvent.click(screen.getByText('Name'));
    expect(firstRowText()).toContain('Admin');
    fireEvent.click(screen.getByText('Name'));
    expect(firstRowText()).toContain('user104');

    // Email asc
    fireEvent.click(screen.getByText('Email'));
    expect(firstRowText()).toContain('a@b.c');

    // Gender asc ('' first), then desc ('M' first)
    fireEvent.click(screen.getByText('Gender'));
    expect(firstRowText()).toContain('user104');
    fireEvent.click(screen.getByText('Gender'));
    expect(firstRowText()).toContain('Admin');

    // Status asc
    fireEvent.click(screen.getByText('Status'));
    expect(firstRowText()).toContain('Admin');

    // Joined asc (missing dates sort first)
    fireEvent.click(screen.getByText('Joined'));
    expect(firstRowText()).toContain('Runner H');
  });

  test('paginates the members table', async () => {
    renderPage();
    await waitForDashboard();

    expect(screen.queryByText('Quinn Quit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /go to next page/i }));
    expect(screen.getByText('Quinn Quit')).toBeInTheDocument();

    // Bump rows per page to 25 -> everything on one page
    selectMuiOption(screen.getByRole('combobox'), '25');
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Quinn Quit')).toBeInTheDocument();
  });

  test('edits a member and saves converted values', async () => {
    renderPage();
    await waitForDashboard();

    const row = screen.getByText('Runner A').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit Member' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('NYRR Registered Name'), { target: { value: 'Runner AA' } });
    fireEvent.change(within(dialog).getByLabelText('Display Name (CN)'), { target: { value: '乙' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'aa@x.com' } });
    fireEvent.change(within(dialog).getByLabelText('Birth Year'), { target: { value: '1991' } });
    // Touch the phone handler then clear it -> covers the empty-value skip branch
    fireEvent.change(within(dialog).getByLabelText('Phone'), { target: { value: '555' } });
    fireEvent.change(within(dialog).getByLabelText('Phone'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByLabelText('NYRR Runner ID'), { target: { value: 'NY-9' } });

    const [genderSelect, statusSelect] = within(dialog).getAllByRole('combobox');
    selectMuiOption(genderSelect, 'Female');
    selectMuiOption(statusSelect, 'Committee');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(membersApi.updateMember).toHaveBeenCalledWith(
        102,
        {
          display_name: 'Runner AA',
          display_name_cn: '乙',
          email: 'aa@x.com',
          gender: 'F',
          birth_year: 1991,
          nyrr_member_id: 'NY-9',
          status: 'committee',
        },
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Updated Runner AA successfully!')).toBeInTheDocument();
    // Member list is refetched after saving
    expect(membersApi.getAllMembers).toHaveBeenCalledTimes(2);
  });

  test('shows error when member update fails', async () => {
    membersApi.updateMember.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();

    const row = screen.getByText('Runner B').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit Member' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to update member. Please try again.')).toBeInTheDocument();

    // Dialog stays open on failure; close it with the Cancel button
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('edit member dialog closes via Escape and the title close icon', async () => {
    renderPage();
    await waitForDashboard();

    // Close via Escape (Dialog onClose)
    const row = screen.getByText('Runner A').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit Member' }));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Close via the title close icon
    fireEvent.click(await within(row).findByRole('button', { name: 'Edit Member' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByTestId('CloseIcon').closest('button'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(membersApi.updateMember).not.toHaveBeenCalled();
  });
});

describe('activities tab', () => {
  test('lists pending activities and rejects one from the table', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Activities (2)');

    expect(await screen.findByText('Pending Activity Verification (2)')).toBeInTheDocument();
    expect(screen.getByText('Group Run')).toBeInTheDocument();
    expect(screen.getByText('Member #999')).toBeInTheDocument(); // unknown member fallback
    expect(screen.getByText('Run 1')).toBeInTheDocument();
    expect(screen.getByText('Run 2')).toBeInTheDocument();

    const row = screen.getByText('Solo Run').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(activitiesApi.verifyActivity).toHaveBeenCalledWith(41, false, 'Activity not verified', ADMIN_UID)
    );
    expect(await screen.findByText('Activity rejected successfully!')).toBeInTheDocument();
    expect(screen.queryByText('Solo Run')).not.toBeInTheDocument();
  });

  test('verifies an activity from the details dialog', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Activities (2)');

    const row = (await screen.findByText('Group Run')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'View Details & Verify' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Member: Runner A/)).toBeInTheDocument();
    expect(within(dialog).getByText('Fun run')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'View Proof' })).toHaveAttribute('href', 'https://proof.example');
    expect(within(dialog).getByText('Run 1: pending')).toBeInTheDocument();
    expect(within(dialog).getByText('Run 2: verified')).toBeInTheDocument();
    expect(within(dialog).getByText('Run 3: rejected')).toBeInTheDocument();
    expect(activitiesApi.getMemberActivities).toHaveBeenCalledWith(102);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify / 验证' }));
    await waitFor(() =>
      expect(activitiesApi.verifyActivity).toHaveBeenCalledWith(40, true, null, ADMIN_UID)
    );
    expect(await screen.findByText('Activity verified successfully!')).toBeInTheDocument();
  });

  test('details dialog still opens when member activity fetch fails, and can be cancelled', async () => {
    activitiesApi.getMemberActivities.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Activities (2)');

    const row = (await screen.findByText('Solo Run')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'View Details & Verify' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Activity #2')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel / 取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Re-open and close via Escape (Dialog onClose)
    const rowAgain = screen.getByText('Solo Run').closest('tr');
    fireEvent.click(await within(rowAgain).findByRole('button', { name: 'View Details & Verify' }));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Re-open and reject from the details dialog
    fireEvent.click(await within(rowAgain).findByRole('button', { name: 'View Details & Verify' }));
    const dialogAgain = await screen.findByRole('dialog');
    fireEvent.click(within(dialogAgain).getByRole('button', { name: 'Reject / 拒绝' }));
    await waitFor(() =>
      expect(activitiesApi.verifyActivity).toHaveBeenCalledWith(41, false, 'Activity could not be verified', ADMIN_UID)
    );
    expect(await screen.findByText('Activity rejected successfully!')).toBeInTheDocument();
  });

  test('shows error when verification fails', async () => {
    activitiesApi.verifyActivity.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Activities (2)');

    const row = (await screen.findByText('Solo Run')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Failed to verify activity. Please try again.')).toBeInTheDocument();
  });
});

describe('events tab', () => {
  test('renders event rows with status chips and fallbacks', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Events');

    expect(await screen.findByText('Manage Events')).toBeInTheDocument();
    expect(screen.getByText('Spring Run')).toBeInTheDocument();
    expect(screen.getByText('春跑')).toBeInTheDocument();
    expect(screen.getByText('Central Park')).toBeInTheDocument();
    expect(screen.getAllByText('TBD')).toHaveLength(3); // events missing a location
    expect(screen.getByText('★ Highlight')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  test('creates a new event', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Events');

    fireEvent.click(await screen.findByRole('button', { name: '+ Create Event' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Create Event / 创建活动')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Event Name \(English\)/), { target: { value: 'Brand New Run' } });
    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '9:00 AM' } });
    selectMuiOption(within(dialog).getByRole('combobox'), /Past \(Memories\)/);
    fireEvent.click(within(dialog).getByRole('checkbox')); // highlight switch

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(eventsApi.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Brand New Run',
          time: '9:00 AM',
          status: 'Past',
          is_highlight: true,
          date: expect.any(String),
        }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Event created successfully!')).toBeInTheDocument();
    expect(screen.getByText('Brand New Run')).toBeInTheDocument();
  });

  test('edits a legacy Highlight event, normalizing its status', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Events');

    const row = (await screen.findByText('Legacy Gala')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Event / 编辑活动')).toBeInTheDocument();
    // Legacy 'Highlight' normalized to Past + is_highlight
    expect(within(dialog).getByRole('checkbox')).toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(eventsApi.updateEvent).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ status: 'Past', is_highlight: true, name: 'Legacy Gala' }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Event updated successfully!')).toBeInTheDocument();
    expect(screen.getByText('Legacy Gala Updated')).toBeInTheDocument();
  });

  test('shows error when saving an event fails, and dialog can be cancelled', async () => {
    eventsApi.updateEvent.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Events');

    const row = (await screen.findByText('Spring Run')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save event. Please try again.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('deletes an event after confirmation (and honors cancel)', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Events');

    const row = (await screen.findByText('Spring Run')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Event?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Delete Event?')).not.toBeInTheDocument());
    expect(eventsApi.deleteEvent).not.toHaveBeenCalled();

    // Re-query the row: the exiting dialog aria-hid the page until unmounted
    const rowAgain = screen.getByText('Spring Run').closest('tr');
    fireEvent.click(await within(rowAgain).findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(eventsApi.deleteEvent).toHaveBeenCalledWith(10, ADMIN_UID));
    expect(await screen.findByText('Event deleted successfully!')).toBeInTheDocument();
    expect(screen.queryByText('Spring Run')).not.toBeInTheDocument();
  });
});

describe('banners tab', () => {
  test('renders banner rows and image error fallback', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Banners');

    expect(await screen.findByText('Manage Homepage Banners')).toBeInTheDocument();
    expect(screen.getByText('Banner One')).toBeInTheDocument();
    expect(screen.getByText('横幅一')).toBeInTheDocument();
    expect(screen.getByText('No label')).toBeInTheDocument();
    expect(screen.getByText('No link')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();

    const img = screen.getByAltText('B1');
    fireEvent.error(img);
    expect(img.src).toContain('/master-image-1.jpg');
  });

  test('creates a banner with defaulted display order', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Banners');

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Banner' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Image URL/), { target: { value: '/new.jpg' } });
    fireEvent.change(within(dialog).getByLabelText('Label (English)'), { target: { value: 'New Banner' } });
    selectMuiOption(within(dialog).getByRole('combobox'), 'Inactive');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(bannersApi.createBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          image_url: '/new.jpg',
          label_en: 'New Banner',
          display_order: 2, // defaults to banners.length
          is_active: false,
        }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Banner created successfully!')).toBeInTheDocument();
    expect(screen.getByText('New Banner')).toBeInTheDocument();
  });

  test('edits a banner', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Banners');

    const row = (await screen.findByText('Banner One')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Banner / 编辑横幅')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Label (Chinese)'), { target: { value: '新横幅' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bannersApi.updateBanner).toHaveBeenCalledWith(
        20,
        expect.objectContaining({ label_cn: '新横幅', image_url: '/b1.jpg', is_active: true }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Banner updated successfully!')).toBeInTheDocument();
    expect(screen.getByText('Banner One Updated')).toBeInTheDocument();
  });

  test('deletes an unlabeled banner using the id fallback name', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Banners');

    const row = (await screen.findByText('No label')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Banner?')).toBeInTheDocument();
    expect(screen.getByText(/delete the banner "Banner #21"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bannersApi.deleteBanner).toHaveBeenCalledWith(21, ADMIN_UID));
    expect(await screen.findByText('Banner deleted successfully!')).toBeInTheDocument();
  });

  test('shows error when saving a banner fails, and dialog can be cancelled', async () => {
    bannersApi.createBanner.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Banners');

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Banner' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Image URL/), { target: { value: '/x.jpg' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save banner. Please try again.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('sections tab', () => {
  test('renders section rows and image error fallback', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Sections');

    expect(await screen.findByText('Manage Homepage Sections')).toBeInTheDocument();
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('板块一')).toBeInTheDocument();
    expect(screen.getByText('No Image')).toBeInTheDocument();

    const img = screen.getByAltText('Section One');
    fireEvent.error(img);
    expect(img.src).toContain('/placeholder-section.png');
  });

  test('creates a section', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Sections');

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Section' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Title \(English\)/), { target: { value: 'New Section' } });
    fireEvent.change(within(dialog).getByLabelText(/Link Path/), { target: { value: '/new' } });
    fireEvent.change(within(dialog).getByLabelText(/Display Order/), { target: { value: '5' } });
    selectMuiOption(within(dialog).getByRole('combobox'), 'Inactive');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sectionsApi.createSection).toHaveBeenCalledWith(
        expect.objectContaining({ title_en: 'New Section', link_path: '/new', display_order: '5', is_active: false }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Section created successfully!')).toBeInTheDocument();
    expect(screen.getByText('New Section')).toBeInTheDocument();
  });

  test('edits and deletes sections (delete uses id fallback name)', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Sections');

    // Edit Section One
    const row = (await screen.findByText('Section One')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Section / 编辑板块')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Title \(Chinese\)/), { target: { value: '新板块' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sectionsApi.updateSection).toHaveBeenCalledWith(
        30,
        expect.objectContaining({ title_cn: '新板块' }),
        ADMIN_UID
      )
    );
    expect(await screen.findByText('Section updated successfully!')).toBeInTheDocument();

    // Delete the untitled section -> fallback name (findBy: the exiting edit
    // dialog aria-hides the page briefly)
    const untitledRow = screen.getByText('No Image').closest('tr');
    fireEvent.click(await within(untitledRow).findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Section?')).toBeInTheDocument();
    expect(screen.getByText(/delete the section "Section #31"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(sectionsApi.deleteSection).toHaveBeenCalledWith(31, ADMIN_UID));
    expect(await screen.findByText('Section deleted successfully!')).toBeInTheDocument();
  });

  test('shows error when saving a section fails', async () => {
    sectionsApi.createSection.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Sections');

    fireEvent.click(await screen.findByRole('button', { name: '+ Add Section' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Title \(English\)/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Link Path/), { target: { value: '/x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save section. Please try again.')).toBeInTheDocument();
  });
});

describe('newsletter tab', () => {
  test('sends a newsletter and clears the form', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Newsletter');

    const subject = await screen.findByLabelText('Subject / 主题');
    const content = screen.getByLabelText('Content / 内容');
    const sendButton = screen.getByRole('button', { name: 'Send Newsletter' });
    expect(sendButton).toBeDisabled();

    fireEvent.change(subject, { target: { value: 'Hello' } });
    fireEvent.change(content, { target: { value: 'World' } });
    fireEvent.click(sendButton);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/newsletter/send'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-Firebase-UID': ADMIN_UID }),
          body: JSON.stringify({ subject: 'Hello', content: 'World' }),
        })
      )
    );
    expect(await screen.findByText('Newsletter sent! 5 delivered, 0 failed out of 5 members.')).toBeInTheDocument();
    expect(subject).toHaveValue('');
    expect(content).toHaveValue('');
  });

  test('shows error when the newsletter send fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'SMTP down' }) });
    renderPage();
    await waitForDashboard();
    openTab('Newsletter');

    fireEvent.change(await screen.findByLabelText('Subject / 主题'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Content / 内容'), { target: { value: 'World' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Newsletter' }));

    expect(await screen.findByText('Failed to send newsletter: SMTP down')).toBeInTheDocument();
  });
});

describe('analytics tab', () => {
  test('shows computed member, event and donation stats', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Analytics');

    expect(await screen.findByText('Club Analytics')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // active runners
    expect(screen.getByText('14 total members, 2 pending')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // total events
    expect(screen.getByText('1 upcoming, 1 highlights')).toBeInTheDocument();
    expect(screen.getByText('3,500')).toBeInTheDocument(); // total donations
    expect(screen.getByText('From 5 donors')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // committee + admin
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
  });
});

describe('meeting notes tab', () => {
  test('renders the meeting minutes editor with the admin uid', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Meeting Notes');
    expect(await screen.findByTestId('meeting-minutes-editor')).toHaveTextContent(`uid:${ADMIN_UID}`);
  });
});

describe('settings tab', () => {
  test('opens via ?tab=settings, loads values and saves all settings', async () => {
    renderPage('/admin?tab=settings');
    await waitForDashboard();

    expect(await screen.findByText('Site Settings / 网站设置')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(settingsApi.getSettingsByCategory).toHaveBeenCalledWith('social', ADMIN_UID));
    expect(settingsApi.getSettingsByCategory).toHaveBeenCalledWith('join', ADMIN_UID);

    // Loaded values populate the form
    const instagram = await screen.findByDisplayValue('https://insta');
    expect(screen.getByDisplayValue('https://xhs')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();

    // Change every field
    fireEvent.change(instagram, { target: { value: 'https://new-insta' } });
    fireEvent.change(screen.getByLabelText(/Xiaohongshu URL/), { target: { value: 'https://new-xhs' } });
    fireEvent.change(screen.getByLabelText('Heylo URL'), { target: { value: 'https://new-heylo' } });
    fireEvent.change(screen.getByLabelText(/Shop URL/), { target: { value: 'https://new-shop' } });
    fireEvent.change(screen.getByLabelText(/Shop Demo Video URL/), { target: { value: 'https://new-video' } });
    fireEvent.change(screen.getByLabelText(/Min English Words/), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText(/Min Chinese Characters/), { target: { value: '300' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));

    await waitFor(() => expect(settingsApi.updateSetting).toHaveBeenCalledTimes(7));
    expect(settingsApi.updateSetting).toHaveBeenCalledWith('social_instagram', { value: 'https://new-insta' }, ADMIN_UID);
    expect(settingsApi.updateSetting).toHaveBeenCalledWith('social_heylo', { value: 'https://new-heylo' }, ADMIN_UID);
    expect(settingsApi.updateSetting).toHaveBeenCalledWith('join_min_english_words', { value: '150' }, ADMIN_UID);
    expect(settingsApi.updateSetting).toHaveBeenCalledWith('join_min_chinese_chars', { value: '300' }, ADMIN_UID);
    expect(await screen.findByText(/Settings saved successfully!/)).toBeInTheDocument();
    expect(mockRefreshLinks).toHaveBeenCalled();
  });

  test('falls back to defaults when settings fail to load', async () => {
    settingsApi.getSettingsByCategory.mockRejectedValue(new Error('nope'));
    renderPage('/admin?tab=settings');
    await waitForDashboard();

    expect(await screen.findByText('Site Settings / 网站设置')).toBeInTheDocument();
    await waitFor(() => expect(settingsApi.getSettingsByCategory).toHaveBeenCalled());
    expect(screen.getByLabelText(/Min English Words/)).toHaveValue(120);
    expect(screen.getByLabelText(/Min Chinese Characters/)).toHaveValue(240);
  });

  test('shows error when saving settings fails', async () => {
    settingsApi.updateSetting.mockRejectedValue(new Error('nope'));
    renderPage('/admin?tab=settings');
    await waitForDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /Save Settings/ }));
    expect(await screen.findByText('Failed to save settings. Please try again.')).toBeInTheDocument();
  });
});

describe('committee management tab (admin only)', () => {
  test('promotes a runner and demotes a committee member', async () => {
    renderPage();
    await waitForDashboard();
    openTab('Committee Mgmt');

    expect(await screen.findByText('Committee Management')).toBeInTheDocument();
    expect(screen.getByText('Current Committee Members (1)')).toBeInTheDocument();
    expect(screen.getByText('Runners (Eligible for Promotion) (8)')).toBeInTheDocument();

    // Promote Runner A
    const runnerRow = screen.getByText('Runner A').closest('tr');
    fireEvent.click(within(runnerRow).getByRole('button', { name: 'Promote to Committee' }));
    await waitFor(() => expect(membersApi.promoteToCommittee).toHaveBeenCalledWith(102, ADMIN_UID));
    expect(await screen.findByText('Runner A promoted to committee successfully!')).toBeInTheDocument();
    expect(screen.getByText('Current Committee Members (2)')).toBeInTheDocument();

    // Demote Cathy
    const cathyRow = screen.getByText('Cathy Committee').closest('tr');
    fireEvent.click(within(cathyRow).getByRole('button', { name: 'Demote to Runner' }));
    await waitFor(() => expect(membersApi.demoteFromCommittee).toHaveBeenCalledWith(101, ADMIN_UID));
    expect(await screen.findByText('Cathy Committee demoted to runner successfully!')).toBeInTheDocument();
  });

  test('shows errors when promote or demote fails', async () => {
    membersApi.promoteToCommittee.mockRejectedValueOnce(new Error('nope'));
    membersApi.demoteFromCommittee.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    await waitForDashboard();
    openTab('Committee Mgmt');

    const runnerRow = (await screen.findByText('Runner B')).closest('tr');
    fireEvent.click(within(runnerRow).getByRole('button', { name: 'Promote to Committee' }));
    expect(await screen.findByText('Failed to promote member. Please try again.')).toBeInTheDocument();

    const cathyRow = screen.getByText('Cathy Committee').closest('tr');
    fireEvent.click(within(cathyRow).getByRole('button', { name: 'Demote to Runner' }));
    expect(await screen.findByText('Failed to demote member. Please try again.')).toBeInTheDocument();
  });
});

describe('empty states', () => {
  test('renders empty states and the >20 runners truncation notice', async () => {
    const bulkRunners = Array.from({ length: 25 }, (_, i) =>
      mkMember(200 + i, { display_name: `Bulk Runner ${String(i).padStart(2, '0')}` })
    );
    membersApi.getPendingMembers.mockResolvedValue([]);
    membersApi.getAllMembers.mockResolvedValue(bulkRunners);
    bannersApi.getAllBanners.mockResolvedValue([]);
    sectionsApi.getAllSections.mockResolvedValue([]);
    activitiesApi.getPendingActivities.mockResolvedValue([]);
    donorsApi.getDonationSummary.mockResolvedValue([]);

    renderPage();
    await waitForDashboard();

    expect(screen.getByText(/No pending applications at this time/)).toBeInTheDocument();

    openTab('Activities');
    expect(await screen.findByText(/No pending activities awaiting verification/)).toBeInTheDocument();

    openTab('Banners');
    expect(await screen.findByText(/No banners configured/)).toBeInTheDocument();

    openTab('Sections');
    expect(await screen.findByText(/No sections configured/)).toBeInTheDocument();

    openTab('Committee Mgmt');
    expect(await screen.findByText(/No committee members yet/)).toBeInTheDocument();
    expect(screen.getByText('Showing 20 of 25 runners')).toBeInTheDocument();

    // Analytics falls back to zeroed donation totals when no summary exists
    openTab('Analytics');
    expect(await screen.findByText('From 0 donors')).toBeInTheDocument();
    expect(screen.getAllByText('$0.00')).toHaveLength(2);
  });
});
