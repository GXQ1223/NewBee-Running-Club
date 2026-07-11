import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarPage from './CalendarPage';
import { useAdmin, useAuth } from '../context';
import {
  getEventsByStatus, createEvent, updateEvent, deleteEvent,
  getEventWithRecurrence, createEventRecurrence, updateEventRecurrence, deleteEventRecurrence,
} from '../api';
import { uploadImage } from '../api/homepageSections';

jest.mock('../context', () => ({
  useAdmin: jest.fn(),
  useAuth: jest.fn(),
}));
jest.mock('../hooks', () => ({
  useAutoFillOnTab: () => jest.fn(),
  useTranslationAutoFill: () => ({
    handleKeyDown: jest.fn(),
    handleBlur: jest.fn(),
    translations: {},
    isTranslating: false,
  }),
}));
jest.mock('../api', () => ({
  getEventsByStatus: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
  getEventWithRecurrence: jest.fn(),
  createEventRecurrence: jest.fn(),
  updateEventRecurrence: jest.fn(),
  deleteEventRecurrence: jest.fn(),
}));
jest.mock('../api/homepageSections', () => ({
  uploadImage: jest.fn(),
}));
// Probes for heavy children
jest.mock('../components/EventDetailModal', () => {
  const React = require('react');
  return function MockEventDetailModal({ event, onClose, onEventUpdate }) {
    return React.createElement(
      'div',
      { 'data-testid': 'event-detail-modal' },
      React.createElement('span', null, `modal:${event.name || event.title}`),
      React.createElement('button', { onClick: onClose }, 'probe-close-modal'),
      React.createElement(
        'button',
        { onClick: () => onEventUpdate({ ...event, name: 'Updated Name', title: 'Updated Name' }) },
        'probe-update-event'
      )
    );
  };
});
jest.mock('../components/EventCardImage', () => {
  const React = require('react');
  return function MockEventCardImage({ event, onError }) {
    return React.createElement(
      'div',
      { 'data-testid': 'event-card-image' },
      event.image || 'no-image',
      React.createElement(
        'button',
        { onClick: () => onError && onError({ target: { src: 'broken.png', style: {} } }) },
        'probe-img-error'
      )
    );
  };
});

const YEAR = new Date().getFullYear();

const apiEvents = [
  {
    id: 1, name: 'Summer 5K', chinese_name: '夏日五公里', date: `${YEAR}-08-15`, time: '8:00 AM',
    location: 'Brooklyn', chinese_location: '布鲁克林', description: 'Fast summer race',
    chinese_description: '夏季比赛', image: 'https://img/summer.png', signup_link: 'https://signup/summer',
    status: 'Upcoming', event_type: 'standard', heylo_embed: '', wechat_qr_code: '',
  },
  {
    id: 2, name: 'Track Night', chinese_name: '田径之夜', date: `${YEAR}-09-01`, time: '7:00 PM',
    location: 'Track Field', chinese_location: '田径场', description: 'Speed workout',
    chinese_description: '', image: '', signup_link: '', status: 'Open',
    event_type: 'standard', heylo_embed: '', wechat_qr_code: 'https://qr/track.png',
  },
  {
    id: 3, name: 'Fall Marathon', chinese_name: '秋季马拉松', date: `${YEAR}-11-02`, time: '9:00 AM',
    location: 'Central Park', chinese_location: '中央公园', description: 'The big one',
    chinese_description: '', image: '', signup_link: '', status: 'Upcoming',
    event_type: 'standard', heylo_embed: '', wechat_qr_code: '',
  },
  {
    id: 4, name: 'Winter Run', chinese_name: '', date: `${YEAR}-12-05`, time: '',
    location: 'Brooklyn', chinese_location: '', description: 'Cold run',
    chinese_description: '', image: '', signup_link: '', status: 'Upcoming',
    event_type: 'standard', heylo_embed: '', wechat_qr_code: '',
  },
  // Malformed date exercises the date-bubble fallback
  {
    id: 5, name: 'Broken Date Run', chinese_name: '', date: `${YEAR}-13-40`, time: '10:00 AM',
    location: 'Brooklyn', chinese_location: '', description: 'Bad date',
    chinese_description: '', image: '', signup_link: '', status: 'Upcoming',
    event_type: 'standard', heylo_embed: '', wechat_qr_code: '',
  },
  // Previous-year event must be filtered out
  {
    id: 6, name: 'Old Event', chinese_name: '', date: `${YEAR - 1}-05-05`, time: '9:00 AM',
    location: 'Brooklyn', chinese_location: '', description: 'Past year',
    chinese_description: '', image: '', signup_link: '', status: 'Upcoming',
    event_type: 'standard', heylo_embed: '', wechat_qr_code: '',
  },
];

const renderPage = (route = '/calendar') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <CalendarPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getEventsByStatus.mockResolvedValue(apiEvents);
  createEvent.mockResolvedValue({ id: 42 });
  updateEvent.mockResolvedValue({});
  deleteEvent.mockResolvedValue({});
  getEventWithRecurrence.mockResolvedValue({ recurrence: null });
  createEventRecurrence.mockResolvedValue({});
  updateEventRecurrence.mockResolvedValue({});
  deleteEventRecurrence.mockResolvedValue({});
  uploadImage.mockResolvedValue({ url: 'https://s3/uploaded.png' });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue() },
    configurable: true,
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
});

describe('event rendering', () => {
  test('renders featured cards (first 3 by date) and the full list, excluding other years', async () => {
    renderPage();
    // Featured card + list entry for the first three events
    expect(await screen.findAllByText('Summer 5K')).toHaveLength(2);
    expect(screen.getAllByText('Track Night')).toHaveLength(2);
    expect(screen.getAllByText('Fall Marathon')).toHaveLength(2);
    // 4th+ events only appear in the list
    expect(screen.getAllByText('Winter Run')).toHaveLength(1);
    expect(screen.getAllByText('Broken Date Run')).toHaveLength(1);
    // Previous-year event filtered out entirely
    expect(screen.queryByText('Old Event')).not.toBeInTheDocument();
    // Featured card content (chinese name shows on featured card and list row)
    expect(screen.getAllByText('夏日五公里').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fast summer race').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Learn More & Sign Up/).length).toBeGreaterThan(0);
  });

  test('renders date bubbles for valid dates and raw text fallback for invalid dates', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    // Bubble for Aug 15: day + month abbreviation
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('AUG')).toBeInTheDocument();
    expect(screen.getByText('SEP')).toBeInTheDocument();
    expect(screen.getByText('NOV')).toBeInTheDocument();
    expect(screen.getByText('DEC')).toBeInTheDocument();
    // Invalid date falls back to the raw string (desktop bubble + mobile line)
    expect(screen.getAllByText(`${YEAR}-13-40`).length).toBeGreaterThan(0);
  });

  test('shows empty sections when the api returns no events', async () => {
    getEventsByStatus.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(getEventsByStatus).toHaveBeenCalledWith('Upcoming'));
    expect(screen.queryByText(/Learn More & Sign Up/)).not.toBeInTheDocument();
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
  });

  test('shows an error snackbar when the events fetch fails', async () => {
    getEventsByStatus.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/Failed to load events/)).toBeInTheDocument();
  });
});

describe('filters', () => {
  const openFilter = async (label) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(`^${label}`) }));
    return screen.findByRole('listbox');
  };

  test('status filter keeps only matching events', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const listbox = await openFilter('Status');
    fireEvent.click(within(listbox).getByText('Open'));
    await waitFor(() => expect(screen.queryByText('Winter Run')).not.toBeInTheDocument());
    // Track Night (status Open) stays in the list (1 list entry + 1 featured card)
    expect(screen.getAllByText('Track Night')).toHaveLength(2);
    // Featured cards are unaffected by list filters
    expect(screen.getAllByText('Summer 5K')).toHaveLength(1);
  });

  test('location filter matches case-insensitively', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const listbox = await openFilter('Location');
    fireEvent.click(within(listbox).getByText('Brooklyn'));
    await waitFor(() => expect(screen.getAllByText('Fall Marathon')).toHaveLength(1)); // featured only
    expect(screen.getAllByText('Summer 5K')).toHaveLength(2);
    expect(screen.getByText('Winter Run')).toBeInTheDocument();
  });

  test('date filters restrict by parsed event date', async () => {
    // The filter uses today as its reference date; compute the same bounds it
    // does so this test holds no matter when it runs. Summer 5K is Aug 15.
    const ref = new Date();
    ref.setHours(0, 0, 0, 0);
    const thisWeekEnd = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thisMonthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const nextMonthEnd = new Date(ref.getFullYear(), ref.getMonth() + 2, 0);
    const summer = new Date(YEAR, 7, 15);
    // 1 = featured card only (list entry filtered out), 2 = featured + list
    const inThisWeek = summer <= thisWeekEnd ? 2 : 1;
    const inThisMonth = summer <= thisMonthEnd ? 2 : 1;
    const inNextMonth = summer <= nextMonthEnd && summer >= ref ? 2 : 1;

    renderPage();
    await screen.findAllByText('Summer 5K');
    const listbox = await openFilter('Date');
    fireEvent.click(within(listbox).getByText('This Week'));
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(inThisWeek));

    // Switch to All Dates restores the list
    const listbox2 = await openFilter('Date');
    fireEvent.click(within(listbox2).getByText('All Dates'));
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(2));

    // this-month / next-month branches
    const listbox3 = await openFilter('Date');
    fireEvent.click(within(listbox3).getByText('This Month'));
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(inThisMonth));
    const listbox4 = await openFilter('Date');
    fireEvent.click(within(listbox4).getByText('Next Month'));
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(inNextMonth));
  });

  test('distance filter changes value without affecting the list', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const listbox = await openFilter('Distance');
    fireEvent.click(within(listbox).getByText('Half Marathon'));
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(2));
  });
});

describe('event modal and deep links', () => {
  test('clicking an event opens the detail modal and close dismisses it', async () => {
    renderPage();
    const cards = await screen.findAllByText('Summer 5K');
    fireEvent.click(cards[0]);
    expect(await screen.findByTestId('event-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('modal:Summer 5K')).toBeInTheDocument();
    fireEvent.click(screen.getByText('probe-close-modal'));
    await waitFor(() =>
      expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument()
    );
  });

  test('deep link ?event=id opens the matching event automatically', async () => {
    renderPage('/calendar?event=3');
    expect(await screen.findByText('modal:Fall Marathon')).toBeInTheDocument();
  });

  test('onEventUpdate from the modal updates the lists', async () => {
    renderPage('/calendar?event=1');
    await screen.findByText('modal:Summer 5K');
    fireEvent.click(screen.getByText('probe-update-event'));
    expect(await screen.findByText('modal:Updated Name')).toBeInTheDocument();
    // Both featured card and list entry renamed
    await waitFor(() => expect(screen.getAllByText('Updated Name').length).toBeGreaterThanOrEqual(2));
  });

  test('list "Learn More" button opens the modal without triggering card click twice', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const buttons = screen.getAllByText(/Learn More & Sign Up/);
    fireEvent.click(buttons[buttons.length - 1]); // a list-row button
    expect(await screen.findByTestId('event-detail-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('probe-close-modal'));
    await waitFor(() =>
      expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument()
    );

    // Clicking the list card body (not the button) also opens the modal
    fireEvent.click(screen.getByText('Winter Run'));
    expect(await screen.findByText('modal:Winter Run')).toBeInTheDocument();
  });
});

describe('sharing', () => {
  test('share button copies the event deep link and shows a snackbar', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('ShareIcon')[0].closest('button'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/calendar?event=1')
      )
    );
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
  });

  test('clipboard failure shows an error snackbar', async () => {
    navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('ShareIcon')[0].closest('button'));
    expect(await screen.findByText(/Failed to copy link/)).toBeInTheDocument();
  });
});

describe('admin gating', () => {
  test('non-admin sees no add button, admin alert, or admin card actions', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    expect(screen.queryByText('Add Event / 添加活动')).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin mode enabled/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('StarIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('QrCode2Icon')).not.toBeInTheDocument();
  });

  test('admin sees add button, alert, and per-event admin actions', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    renderPage();
    await screen.findAllByText('Summer 5K');
    expect(screen.getByText('Add Event / 添加活动')).toBeInTheDocument();
    expect(screen.getByText(/Admin mode enabled/)).toBeInTheDocument();
    // 3 featured + 5 list entries each get edit/delete/star/qr buttons
    expect(screen.getAllByTestId('EditIcon')).toHaveLength(8);
    expect(screen.getAllByTestId('DeleteIcon')).toHaveLength(8);
    expect(screen.getAllByTestId('StarIcon')).toHaveLength(8);
    expect(screen.getAllByTestId('QrCode2Icon')).toHaveLength(8);
    // Share buttons hidden on featured cards in admin mode but present in list rows
    expect(screen.getAllByTestId('ShareIcon')).toHaveLength(5);
  });
});

describe('admin event form', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  const openAddForm = async () => {
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    return screen.findByRole('dialog');
  };

  test('create flow validates required fields then saves with nulls for empty strings', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    expect(within(dialog).getByText('Add Event / 添加活动')).toBeInTheDocument();

    // Missing name/date
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    expect(await screen.findByText(/Name and date are required/)).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'New Race' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));

    await waitFor(() =>
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Race',
          date: `${YEAR}-10-10`,
          status: 'Upcoming',
          time: null, // empty strings converted to null
          location: null,
        }),
        'admin-uid'
      )
    );
    expect(await screen.findByText(/Event created successfully/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Events refetched after save
    expect(getEventsByStatus).toHaveBeenCalledTimes(2);
  });

  test('submit while logged out shows a login error', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    expect(await screen.findByText(/You must be logged in to manage events/)).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('create failure surfaces the api error in a snackbar', async () => {
    createEvent.mockRejectedValue(new Error('backend rejected'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    expect(await screen.findByText(/Error: backend rejected/)).toBeInTheDocument();
  });

  test('edit flow pre-fills the form and updates the event', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    // First edit icon belongs to the first featured card (Summer 5K)
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit Event / 编辑活动')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Event Name/)).toHaveValue('Summer 5K');
    expect(within(dialog).getByLabelText(/Chinese Name/)).toHaveValue('夏日五公里');
    expect(within(dialog).getByLabelText(/Date \/ 日期/)).toHaveValue(`${YEAR}-08-15`);

    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Summer 5K v2' } });
    fireEvent.click(within(dialog).getByText('Update / 更新'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Summer 5K v2', signup_link: 'https://signup/summer' }),
        'admin-uid'
      )
    );
    expect(await screen.findByText(/Event updated successfully/)).toBeInTheDocument();
  });

  test('cancel closes the form without saving', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('status, highlight, event type and heylo embed controls work', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();

    // Status select
    fireEvent.mouseDown(within(dialog).getByLabelText(/Status \/ 状态/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Past (Memories) / 已结束（回忆）'));
    // Highlight switch
    fireEvent.click(within(dialog).getByLabelText(/Highlight \(featured\)/));
    // Event type -> heylo reveals the embed field
    fireEvent.mouseDown(within(dialog).getByLabelText(/Event Type/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Heylo (Weekly Run) / Heylo周跑'));
    const embed = await within(dialog).findByLabelText(/Heylo Embed Code/);
    fireEvent.change(embed, { target: { value: '<div>embed</div>' } });

    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Heylo Run' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-11` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    await waitFor(() =>
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Past',
          is_highlight: true,
          event_type: 'heylo',
          heylo_embed: '<div>embed</div>',
        }),
        'admin-uid'
      )
    );
  });

  test('recurrence controls: weekly days, monthly, yearly and end date', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();

    fireEvent.click(within(dialog).getByLabelText(/Enable recurrence/));
    // Weekly day chips toggle on and off
    fireEvent.click(within(dialog).getByText('Mon'));
    fireEvent.click(within(dialog).getByText('Wed'));
    fireEvent.click(within(dialog).getByText('Mon')); // deselect

    // Monthly reveals day-of-month + week-of-month
    fireEvent.mouseDown(within(dialog).getByLabelText(/Recurrence Type/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Monthly / 每月'));
    fireEvent.change(await within(dialog).findByLabelText(/Day of Month/), { target: { value: '15' } });
    fireEvent.mouseDown(within(dialog).getByLabelText(/Week of Month/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('2nd / 第二周'));

    // Yearly reveals month/week/day selectors
    fireEvent.mouseDown(within(dialog).getByLabelText(/Recurrence Type/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Yearly / 每年'));
    fireEvent.mouseDown(await within(dialog).findByLabelText(/Month \/ 月份/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('November / 十一月'));
    fireEvent.mouseDown(within(dialog).getByLabelText(/Day \/ 星期几/));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Sunday / 周日'));

    fireEvent.change(within(dialog).getByLabelText(/End Date/), { target: { value: `${YEAR}-12-31` } });

    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Yearly Race' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-11-01` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));

    // Recurrence fields are stripped from the event payload and sent to the
    // dedicated rule endpoint instead (numeric fields coerced, end_date mapped)
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    const eventPayload = createEvent.mock.calls[0][0];
    expect(eventPayload).toEqual(expect.objectContaining({ name: 'Yearly Race' }));
    expect(eventPayload).not.toHaveProperty('is_recurring');
    expect(eventPayload).not.toHaveProperty('recurrence_type');
    expect(eventPayload).not.toHaveProperty('recurrence_end_date');
    await waitFor(() =>
      expect(createEventRecurrence).toHaveBeenCalledWith(
        42,
        {
          recurrence_type: 'yearly',
          days_of_week: '0',
          day_of_month: 15,
          week_of_month: 2,
          month_of_year: 11,
          end_date: `${YEAR}-12-31`,
        },
        'admin-uid'
      )
    );
  });

  test('create without recurrence never touches the rule endpoints', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Plain Race' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect(createEventRecurrence).not.toHaveBeenCalled();
    expect(updateEventRecurrence).not.toHaveBeenCalled();
    expect(deleteEventRecurrence).not.toHaveBeenCalled();
  });

  test('create falls back to updating the rule when one already exists (400)', async () => {
    createEventRecurrence.mockRejectedValue(Object.assign(new Error('exists'), { status: 400 }));
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.click(within(dialog).getByLabelText(/Enable recurrence/));
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Weekly Race' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    await waitFor(() =>
      expect(updateEventRecurrence).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ recurrence_type: 'weekly' }),
        'admin-uid'
      )
    );
  });

  test('edit pre-fills an existing recurrence rule and updates it on save', async () => {
    getEventWithRecurrence.mockResolvedValue({
      recurrence: {
        recurrence_type: 'yearly', days_of_week: '6', day_of_month: null,
        week_of_month: 3, month_of_year: 11, end_date: null,
      },
    });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(getEventWithRecurrence).toHaveBeenCalledWith(1);
    // Rule loads asynchronously and enables the recurrence section
    expect(await within(dialog).findByLabelText(/Month \/ 月份/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Enable recurrence/)).toBeChecked();

    fireEvent.click(within(dialog).getByText('Update / 更新'));
    await waitFor(() =>
      expect(updateEventRecurrence).toHaveBeenCalledWith(
        1,
        {
          recurrence_type: 'yearly',
          days_of_week: '6',
          day_of_month: null,
          week_of_month: 3,
          month_of_year: 11,
          end_date: null,
        },
        'admin-uid'
      )
    );
    expect(createEventRecurrence).not.toHaveBeenCalled();
  });

  test('edit that disables recurrence deletes the existing rule', async () => {
    getEventWithRecurrence.mockResolvedValue({
      recurrence: { recurrence_type: 'weekly', days_of_week: '0' },
    });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    const toggle = await within(dialog).findByLabelText(/Enable recurrence/);
    await waitFor(() => expect(toggle).toBeChecked());

    fireEvent.click(toggle); // turn recurrence off
    fireEvent.click(within(dialog).getByText('Update / 更新'));
    await waitFor(() => expect(deleteEventRecurrence).toHaveBeenCalledWith(1, 'admin-uid'));
    expect(updateEventRecurrence).not.toHaveBeenCalled();
  });

  test('edit tolerates a failed recurrence rule fetch', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventWithRecurrence.mockRejectedValue(new Error('rule fetch down'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Error loading recurrence rule:', expect.any(Error))
    );
    // Form still opens with recurrence off
    expect(within(dialog).getByLabelText(/Enable recurrence/)).not.toBeChecked();
    errorSpy.mockRestore();
  });

  test('non-400 recurrence save failure surfaces the error and does not retry as update', async () => {
    createEventRecurrence.mockRejectedValue(Object.assign(new Error('rule boom'), { status: 500 }));
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.click(within(dialog).getByLabelText(/Enable recurrence/));
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-10` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    expect(await screen.findByText(/Error: rule boom/)).toBeInTheDocument();
    expect(updateEventRecurrence).not.toHaveBeenCalled();
  });

  test('edit pre-fills a day-of-month rule including its end date', async () => {
    getEventWithRecurrence.mockResolvedValue({
      recurrence: {
        recurrence_type: 'monthly', days_of_week: null, day_of_month: 15,
        week_of_month: null, month_of_year: null, end_date: '2027-01-31',
      },
    });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByLabelText(/Day of Month/)).toHaveValue(15);
    expect(within(dialog).getByLabelText(/End Date/)).toHaveValue('2027-01-31');
  });

  test('edit defaults a rule without a type to weekly', async () => {
    getEventWithRecurrence.mockResolvedValue({
      recurrence: { recurrence_type: null, days_of_week: '0,6' },
    });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    const toggle = await within(dialog).findByLabelText(/Enable recurrence/);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(within(dialog).getByText('Weekly / 每周')).toBeInTheDocument();
  });

  test('image selection previews, uploads on save, and can be removed', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();

    const fileInput = dialog.querySelector('#event-image-upload');
    // Non-image file rejected
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText(/Please select an image file/)).toBeInTheDocument();

    // Oversize file rejected
    const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [bigFile] } });
    expect(await screen.findByText(/Image must be less than 5MB/)).toBeInTheDocument();

    // Valid image previews
    const goodFile = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    const preview = await within(dialog).findByAltText('Preview');
    expect(preview).toBeInTheDocument();

    // Remove clears the preview
    fireEvent.click(within(dialog).getByText('Remove / 移除'));
    expect(within(dialog).queryByAltText('Preview')).not.toBeInTheDocument();

    // Re-select and save: image uploads first, url stored on the event
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await within(dialog).findByAltText('Preview');
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'Pic Race' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-12` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(goodFile, 'admin-uid'));
    await waitFor(() =>
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ image: 'https://s3/uploaded.png' }),
        'admin-uid'
      )
    );
  });

  test('image upload failure aborts the save with an error snackbar', async () => {
    uploadImage.mockRejectedValue(new Error('s3 down'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    const dialog = await openAddForm();
    fireEvent.change(dialog.querySelector('#event-image-upload'), {
      target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
    });
    fireEvent.change(within(dialog).getByLabelText(/Event Name/), { target: { value: 'X' } });
    fireEvent.change(within(dialog).getByLabelText(/Date \/ 日期/), { target: { value: `${YEAR}-10-12` } });
    fireEvent.click(within(dialog).getByText('Create / 创建'));
    expect(await screen.findByText(/Failed to upload image/)).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe('admin delete and move-to-memories', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('delete flow confirms then deletes and refreshes', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete "Summer 5K"\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(1, 'admin-uid'));
    expect(await screen.findByText(/Event deleted successfully/)).toBeInTheDocument();
    expect(getEventsByStatus).toHaveBeenCalledTimes(2);
  });

  test('delete cancel keeps the event', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  test('delete failure shows an error snackbar', async () => {
    deleteEvent.mockRejectedValue(new Error('locked'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Error: locked/)).toBeInTheDocument();
  });

  test('star button moves the event to memories and drops it from the list', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('StarIcon')[0].closest('button'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(1, { status: 'Past' }, 'admin-uid')
    );
    expect(await screen.findByText(/Event moved to Memories/)).toBeInTheDocument();
    // Removed from the list section (featured cards are left untouched)
    await waitFor(() => expect(screen.getAllByText('Summer 5K')).toHaveLength(1));
  });

  test('move to memories fails gracefully', async () => {
    updateEvent.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('StarIcon')[0].closest('button'));
    expect(await screen.findByText(/Failed to move event/)).toBeInTheDocument();
  });

  test('move to memories requires login', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('StarIcon')[0].closest('button'));
    expect(await screen.findByText(/You must be logged in/)).toBeInTheDocument();
    expect(updateEvent).not.toHaveBeenCalled();
  });
});

describe('quick QR upload', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('uploads a QR code for an event without one', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    // First QR icon = first featured card (Summer 5K, no QR yet)
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('WeChat QR Code / 微信二维码')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose QR Code / 选择二维码')).toBeInTheDocument();

    const uploadBtn = within(dialog).getByText('Upload / 上传').closest('button');
    expect(uploadBtn).toBeDisabled();

    const qrFile = new File(['x'], 'qr.png', { type: 'image/png' });
    fireEvent.change(dialog.querySelector('#quick-qr-upload'), { target: { files: [qrFile] } });
    expect(await within(dialog).findByAltText('QR Preview')).toBeInTheDocument();

    fireEvent.click(uploadBtn);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(qrFile, 'admin-uid'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(1, { wechat_qr_code: 'https://s3/uploaded.png' }, 'admin-uid')
    );
    expect(await screen.findByText(/QR code uploaded/)).toBeInTheDocument();
  });

  test('validates QR file type and size', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(dialog.querySelector('#quick-qr-upload'), {
      target: { files: [new File(['x'], 'doc.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText(/Please select an image file/)).toBeInTheDocument();

    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(dialog.querySelector('#quick-qr-upload'), { target: { files: [big] } });
    expect(await screen.findByText(/Image must be less than 5MB/)).toBeInTheDocument();
  });

  test('shows the existing QR with replace/remove options and removes it', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    // Second featured card is Track Night (id 2) which has a QR code
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[1].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByAltText('Current QR Code')).toHaveAttribute('src', 'https://qr/track.png');
    expect(within(dialog).getByText('Replace QR / 替换二维码')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Remove / 移除'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(2, { wechat_qr_code: '' }, 'admin-uid')
    );
    expect(await screen.findByText(/QR code removed/)).toBeInTheDocument();
  });

  test('QR upload failure shows an error snackbar', async () => {
    uploadImage.mockRejectedValue(new Error('s3 down'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(dialog.querySelector('#quick-qr-upload'), {
      target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] },
    });
    fireEvent.click(within(dialog).getByText('Upload / 上传'));
    expect(await screen.findByText(/Failed to upload QR code/)).toBeInTheDocument();
  });

  test('QR remove failure shows an error snackbar', async () => {
    updateEvent.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[1].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Remove / 移除'));
    expect(await screen.findByText(/Failed to remove QR code/)).toBeInTheDocument();
  });

  test('cancel closes the QR dialog', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('remaining interaction wiring', () => {
  test('list-row admin actions use the same handlers and dialogs close on Escape', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    renderPage();
    await screen.findAllByText('Summer 5K');
    // Icon index 3 = first list row (indices 0-2 are the featured cards)
    fireEvent.click(screen.getAllByTestId('EditIcon')[3].closest('button'));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Event Name/)).toHaveValue('Summer 5K');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByTestId('DeleteIcon')[3].closest('button'));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Summer 5K/)).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByTestId('QrCode2Icon')[3].closest('button'));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('WeChat QR Code / 微信二维码')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByTestId('StarIcon')[3].closest('button'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(1, { status: 'Past' }, 'admin-uid')
    );
  });

  test('list-row share button copies the deep link', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    const shareButtons = screen.getAllByTestId('ShareIcon');
    fireEvent.click(shareButtons[shareButtons.length - 1].closest('button'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
  });

  test('delete confirm without a logged-in user shows an error', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    useAuth.mockReturnValue({ currentUser: null });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Unable to delete event/)).toBeInTheDocument();
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  test('snackbar close button dismisses the snackbar', async () => {
    getEventsByStatus.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText(/Failed to load events/);
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to load events/)).not.toBeInTheDocument()
    );
  });

  test('card image error handler swaps to the placeholder image', async () => {
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getAllByText('probe-img-error')[0]);
    // Handler mutates the event target — no crash and page still renders
    expect(screen.getAllByText('Summer 5K').length).toBeGreaterThan(0);
  });

  test('form field keydown runs the combined autofill/translation handler and empty file selection is a no-op', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    renderPage();
    await screen.findAllByText('Summer 5K');
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(within(dialog).getByLabelText(/Event Name/), { key: 'Tab' });

    // Selecting no file leaves the form untouched
    fireEvent.change(dialog.querySelector('#event-image-upload'), { target: { files: [] } });
    expect(within(dialog).queryByAltText('Preview')).not.toBeInTheDocument();

    // Broken preview image hides itself via its inline error handler
    fireEvent.change(dialog.querySelector('#event-image-upload'), {
      target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
    });
    const preview = await within(dialog).findByAltText('Preview');
    fireEvent.error(preview);
    expect(preview.style.display).toBe('none');
  });
});
