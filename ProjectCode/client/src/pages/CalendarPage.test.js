import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarPage from './CalendarPage';
import { useAdmin, useAuth } from '../context';
import { getEventsByStatus, updateEvent, deleteEvent } from '../api';

jest.mock('../context', () => ({
  useAdmin: jest.fn(),
  useAuth: jest.fn(),
}));
jest.mock('../api', () => ({
  getEventsByStatus: jest.fn(),
  updateEvent: jest.fn(),
  deleteEvent: jest.fn(),
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
// EventComposer has its own test suite — stub it and probe the wiring
jest.mock('../components/EventComposer', () => {
  const React = require('react');
  return function MockEventComposer({ open, onClose, event, onSaved }) {
    if (!open) return null;
    return React.createElement(
      'div',
      { 'data-testid': 'event-composer' },
      React.createElement(
        'span',
        null,
        event ? `composer-edit:${event.name || event.title}` : 'composer-create'
      ),
      React.createElement('button', { onClick: () => onSaved && onSaved() }, 'probe-composer-save'),
      React.createElement('button', { onClick: onClose }, 'probe-composer-close')
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
// EventEngagementBar fetches /engagement — keep the real EventCard but stub the bar
jest.mock('../components/EventEngagementBar', () => {
  const React = require('react');
  return function MockEventEngagementBar({ eventId }) {
    return React.createElement('div', { 'data-testid': 'engagement-bar' }, `engagement:${eventId}`);
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
  // Malformed date exercises the missing-date-bubble path
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
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getEventsByStatus.mockResolvedValue(apiEvents);
  updateEvent.mockResolvedValue({});
  deleteEvent.mockResolvedValue({});
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue() },
    configurable: true,
  });
});

describe('event rendering', () => {
  test('renders featured cards (first 3 by date) and the full list, excluding other years', async () => {
    renderPage();
    // Featured card + list entry for the first three events
    expect(await screen.findAllByText(/Summer 5K/)).toHaveLength(2);
    expect(screen.getAllByText(/Track Night/)).toHaveLength(2);
    expect(screen.getAllByText(/Fall Marathon/)).toHaveLength(2);
    // 4th+ events only appear in the list
    expect(screen.getAllByText('Winter Run')).toHaveLength(1);
    expect(screen.getAllByText('Broken Date Run')).toHaveLength(1);
    // Previous-year event filtered out entirely
    expect(screen.queryByText('Old Event')).not.toBeInTheDocument();
    // 3 featured + 5 list rows, each an EventCard with an engagement bar
    expect(screen.getAllByTestId('event-card')).toHaveLength(8);
    expect(screen.getAllByTestId('engagement-bar')).toHaveLength(8);
    // Chinese names render inline in the card titles
    expect(screen.getAllByText('夏日五公里').length).toBeGreaterThan(0);
    // Description only shows on featured (grid) cards
    expect(screen.getAllByText('Fast summer race')).toHaveLength(1);
  });

  test('featured cards show date, time and location meta rows', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    const featured = screen.getAllByTestId('event-card')[0]; // Summer 5K featured card
    expect(within(featured).getByText(`${YEAR}-08-15 · 8:00 AM`)).toBeInTheDocument();
    expect(within(featured).getByText('Brooklyn 布鲁克林')).toBeInTheDocument();
    expect(within(featured).getByText('Fast summer race')).toBeInTheDocument();
  });

  test('renders date bubbles for valid dates and omits the bubble for invalid dates', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    // Bubble for Aug 15 appears on both the featured card and the list row
    expect(screen.getAllByText('15')).toHaveLength(2);
    expect(screen.getAllByText('AUG')).toHaveLength(2);
    expect(screen.getAllByText('SEP')).toHaveLength(2);
    expect(screen.getAllByText('NOV')).toHaveLength(2);
    expect(screen.getAllByText('DEC')).toHaveLength(1); // Winter Run, list only
    // Invalid date: no bubble, but the raw date still shows in the meta row
    expect(screen.getByText(`${YEAR}-13-40 · 10:00 AM`)).toBeInTheDocument();
  });

  test('signup CTA appears for upcoming events with a signup link, others get View Details', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    // Summer 5K (featured + list) is the only event with a signup link
    expect(screen.getAllByText('Sign Up 报名')).toHaveLength(2);
    expect(screen.getAllByText('View Details 查看详情')).toHaveLength(6);
  });

  test('shows empty sections when the api returns no events', async () => {
    getEventsByStatus.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(getEventsByStatus).toHaveBeenCalledWith('Upcoming'));
    expect(screen.queryAllByTestId('event-card')).toHaveLength(0);
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    expect(screen.getByText('All Upcoming')).toBeInTheDocument();
  });

  test('shows an error snackbar when the events fetch fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventsByStatus.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/Failed to load events/)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  test('card image error handler swaps to the placeholder image without crashing', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByText('probe-img-error')[0]);
    expect(screen.getAllByText(/Summer 5K/).length).toBeGreaterThan(0);
  });
});

describe('date filter', () => {
  test('date filters restrict the list by parsed event date, featured cards unaffected', async () => {
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
    await screen.findAllByText(/Summer 5K/);
    const openFilter = async () => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Date/ }));
      return screen.findByRole('listbox');
    };

    fireEvent.click(within(await openFilter()).getByText('This Week'));
    await waitFor(() => expect(screen.getAllByText(/Summer 5K/)).toHaveLength(inThisWeek));

    // Switch to All Dates restores the list
    fireEvent.click(within(await openFilter()).getByText('All Dates'));
    await waitFor(() => expect(screen.getAllByText(/Summer 5K/)).toHaveLength(2));

    // this-month / next-month branches
    fireEvent.click(within(await openFilter()).getByText('This Month'));
    await waitFor(() => expect(screen.getAllByText(/Summer 5K/)).toHaveLength(inThisMonth));
    fireEvent.click(within(await openFilter()).getByText('Next Month'));
    await waitFor(() => expect(screen.getAllByText(/Summer 5K/)).toHaveLength(inNextMonth));
  });

  test('the dead Location/Distance/Status filters are gone', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    expect(screen.queryByRole('combobox', { name: /Location/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Distance/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Status/ })).not.toBeInTheDocument();
  });
});

describe('event modal and deep links', () => {
  test('clicking an event card opens the detail modal and close dismisses it', async () => {
    renderPage();
    const cards = await screen.findAllByText(/Summer 5K/);
    fireEvent.click(cards[0]);
    expect(await screen.findByTestId('event-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('modal:Summer 5K')).toBeInTheDocument();
    fireEvent.click(screen.getByText('probe-close-modal'));
    await waitFor(() =>
      expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument()
    );
  });

  test('the View Details CTA opens the modal', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    const winterCard = screen
      .getAllByTestId('event-card')
      .find((card) => within(card).queryByText('Winter Run'));
    fireEvent.click(within(winterCard).getByText('View Details 查看详情'));
    expect(await screen.findByText('modal:Winter Run')).toBeInTheDocument();
  });

  test('the Sign Up CTA opens the signup link instead of the modal', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByText('Sign Up 报名')[0]);
    expect(openSpy).toHaveBeenCalledWith('https://signup/summer', '_blank', 'noopener,noreferrer');
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
    openSpy.mockRestore();
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
    await waitFor(() =>
      expect(screen.getAllByText(/Updated Name/).length).toBeGreaterThanOrEqual(2)
    );
  });
});

describe('sharing', () => {
  test('share button copies the event deep link and shows a snackbar', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('share event')[0]);
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
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('share event')[0]);
    expect(await screen.findByText(/Failed to copy link/)).toBeInTheDocument();
  });

  test('list-row share button copies the deep link', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    const shareButtons = screen.getAllByLabelText('share event');
    fireEvent.click(shareButtons[shareButtons.length - 1]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();
  });
});

describe('admin gating', () => {
  test('non-admin sees no add button, admin alert, or admin card actions', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    expect(screen.queryByText('Add Event / 添加活动')).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin mode enabled/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('edit event')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('delete event')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('move to memories')).not.toBeInTheDocument();
    // Share stays available to everyone
    expect(screen.getAllByLabelText('share event')).toHaveLength(8);
  });

  test('admin sees add button, alert, and per-event admin actions on every card', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    expect(screen.getByText('Add Event / 添加活动')).toBeInTheDocument();
    expect(screen.getByText(/Admin mode enabled/)).toBeInTheDocument();
    // 3 featured + 5 list entries each get edit/delete/star buttons
    expect(screen.getAllByLabelText('edit event')).toHaveLength(8);
    expect(screen.getAllByLabelText('delete event')).toHaveLength(8);
    expect(screen.getAllByLabelText('move to memories')).toHaveLength(8);
    // The quick-QR dialog is gone — QR upload lives in the composer now
    expect(screen.queryByTestId('QrCode2Icon')).not.toBeInTheDocument();
  });
});

describe('event composer wiring', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('Add Event opens the composer in create mode', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    expect(screen.queryByTestId('event-composer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    expect(await screen.findByTestId('event-composer')).toBeInTheDocument();
    expect(screen.getByText('composer-create')).toBeInTheDocument();
  });

  test('per-card edit button opens the composer with that event', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    // First edit icon belongs to the first featured card (Summer 5K)
    fireEvent.click(screen.getAllByLabelText('edit event')[0]);
    expect(await screen.findByText('composer-edit:Summer 5K')).toBeInTheDocument();
  });

  test('list-row edit button opens the composer for the same event', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    // Index 3 = first list row (indices 0-2 are the featured cards)
    fireEvent.click(screen.getAllByLabelText('edit event')[3]);
    expect(await screen.findByText('composer-edit:Summer 5K')).toBeInTheDocument();
  });

  test('onSaved refetches the events', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    expect(getEventsByStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    fireEvent.click(await screen.findByText('probe-composer-save'));
    await waitFor(() => expect(getEventsByStatus).toHaveBeenCalledTimes(2));
  });

  test('onClose hides the composer', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    fireEvent.click(await screen.findByText('probe-composer-close'));
    await waitFor(() =>
      expect(screen.queryByTestId('event-composer')).not.toBeInTheDocument()
    );
  });

  test('editing after creating passes the newly selected event', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getByText('Add Event / 添加活动'));
    expect(await screen.findByText('composer-create')).toBeInTheDocument();
    fireEvent.click(screen.getByText('probe-composer-close'));
    fireEvent.click(screen.getAllByLabelText('edit event')[1]); // Track Night featured card
    expect(await screen.findByText('composer-edit:Track Night')).toBeInTheDocument();
  });
});

describe('admin delete and move-to-memories', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('delete flow confirms then deletes and refreshes', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('delete event')[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete "Summer 5K"\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(1, 'admin-uid'));
    expect(await screen.findByText(/Event deleted successfully/)).toBeInTheDocument();
    expect(getEventsByStatus).toHaveBeenCalledTimes(2);
  });

  test('delete cancel keeps the event', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('delete event')[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  test('delete failure shows an error snackbar', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    deleteEvent.mockRejectedValue(new Error('locked'));
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('delete event')[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Error: locked/)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  test('delete confirm without a logged-in user shows an error', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('delete event')[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Unable to delete event/)).toBeInTheDocument();
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  test('list-row delete button targets the same event as the featured card', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    // Index 3 = first list row (Summer 5K)
    fireEvent.click(screen.getAllByLabelText('delete event')[3]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(1, 'admin-uid'));
  });

  test('star button moves the event to memories and drops it from the list', async () => {
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('move to memories')[0]);
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(1, { status: 'Past' }, 'admin-uid')
    );
    expect(await screen.findByText(/Event moved to Memories/)).toBeInTheDocument();
    // Removed from the list section (featured cards are left untouched)
    await waitFor(() => expect(screen.getAllByText(/Summer 5K/)).toHaveLength(1));
  });

  test('move to memories fails gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    updateEvent.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('move to memories')[0]);
    expect(await screen.findByText(/Failed to move event/)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  test('move to memories requires login', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    renderPage();
    await screen.findAllByText(/Summer 5K/);
    fireEvent.click(screen.getAllByLabelText('move to memories')[0]);
    expect(await screen.findByText(/You must be logged in/)).toBeInTheDocument();
    expect(updateEvent).not.toHaveBeenCalled();
  });
});

describe('snackbar', () => {
  test('snackbar close button dismisses the snackbar', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventsByStatus.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText(/Failed to load events/);
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to load events/)).not.toBeInTheDocument()
    );
    errorSpy.mockRestore();
  });
});
