import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HighlightsPage from './HighlightsPage';
import {
  getBatchEngagement,
  toggleSeriesParent,
  getHighlightsGrouped,
  mergeEventsToGroup,
  removeEventFromGroup,
  undoGroupMerge,
  deleteEvent,
  createEvent,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

jest.mock('../api', () => ({
  getBatchEngagement: jest.fn(),
  toggleSeriesParent: jest.fn(),
  getHighlightsGrouped: jest.fn(),
  mergeEventsToGroup: jest.fn(),
  removeEventFromGroup: jest.fn(),
  undoGroupMerge: jest.fn(),
  deleteEvent: jest.fn(),
  createEvent: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));

// Mock @dnd-kit/core: capture DndContext props so tests can invoke
// onDragStart/onDragEnd directly, and record useDraggable/useDroppable args
// to assert admin gating (disabled flags) without simulating real DnD.
jest.mock('@dnd-kit/core', () => {
  const React = require('react');
  const state = {
    contextProps: null,
    draggables: [],
    droppables: [],
    transformId: undefined,
    draggingId: undefined,
  };
  return {
    __esModule: true,
    __state: state,
    DndContext: (props) => {
      state.contextProps = props;
      return React.createElement(React.Fragment, null, props.children);
    },
    DragOverlay: (props) =>
      React.createElement('div', { 'data-testid': 'drag-overlay' }, props.children),
    useSensor: (sensor, options) => ({ sensor, options }),
    useSensors: (...sensors) => sensors,
    MouseSensor: function MouseSensor() {},
    TouchSensor: function TouchSensor() {},
    closestCenter: jest.fn(),
    useDraggable: (args) => {
      state.draggables.push(args);
      return {
        attributes: {},
        listeners: {},
        setNodeRef: jest.fn(),
        setActivatorNodeRef: jest.fn(),
        transform: args.id === state.transformId ? { x: 4, y: 8 } : null,
        isDragging: args.id === state.draggingId,
      };
    },
    useDroppable: (args) => {
      state.droppables.push(args);
      return { isOver: false, setNodeRef: jest.fn() };
    },
  };
});

jest.mock('../components/EventCardImage', () => (props) => {
  const React = require('react');
  return React.createElement('img', {
    'data-testid': 'event-card-image',
    alt: (props.event && (props.event.name || props.event.title)) || 'event-image',
    src: (props.event && props.event.image) || '',
    onError: props.onError,
  });
});

jest.mock('../components/EventEngagementBar', () => (props) => {
  const React = require('react');
  return React.createElement('div', {
    'data-testid': `engagement-${props.eventId}`,
    'data-initial': JSON.stringify(props.initialData || null),
  });
});

jest.mock('../components/EventGalleryPreview', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': `gallery-preview-${props.eventId}` });
});

jest.mock('../components/EventDetailModal', () => (props) => {
  const React = require('react');
  const event = props.event || {};
  return React.createElement(
    'div',
    {
      'data-testid': 'event-detail-modal',
      'data-event-id': String(event.id),
      'data-event-name': event.name || event.title || '',
    },
    React.createElement('button', { onClick: props.onClose }, 'close-detail'),
    React.createElement(
      'button',
      { onClick: () => props.onEventUpdate({ ...event, name: 'Updated Name' }) },
      'update-detail'
    )
  );
});

jest.mock('../components/EventGroupCard', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    {
      'data-testid': 'event-group-card',
      'data-admin': String(props.adminModeEnabled),
      'data-engagement': JSON.stringify(props.engagementData || null),
      onClick: () => props.onGroupClick(props.group),
    },
    props.group && props.group.group_name
  );
});

jest.mock('../components/EventGroupGalleryModal', () => (props) => {
  const React = require('react');
  if (!props.open) {
    return React.createElement('div', { 'data-testid': 'group-gallery-closed' });
  }
  const group = props.group || { events: [] };
  return React.createElement(
    'div',
    { 'data-testid': 'group-gallery-modal', 'data-admin': String(props.adminModeEnabled) },
    React.createElement('span', null, group.group_name),
    React.createElement(
      'span',
      { 'data-testid': 'group-gallery-count' },
      String((group.events || []).length)
    ),
    React.createElement(
      'button',
      { onClick: () => props.onEventClick(group.events[0]) },
      'open-group-event'
    ),
    React.createElement(
      'button',
      { onClick: () => props.onRemoveFromGroup(group.events[0].id) },
      'remove-group-event'
    ),
    React.createElement('button', { onClick: props.onClose }, 'close-group-gallery')
  );
});

jest.mock('../components/UndoSnackbar', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'undo-snackbar', 'data-open': String(props.open) },
    React.createElement('span', { 'data-testid': 'undo-message' }, props.message),
    props.onUndo
      ? React.createElement('button', { onClick: props.onUndo }, 'undo-action')
      : null,
    React.createElement('button', { onClick: props.onClose }, 'close-undo')
  );
});

const dndState = require('@dnd-kit/core').__state;

// --- Fixtures -------------------------------------------------------------

function makeGroupedData() {
  return {
    groups: [
      {
        parent_event_id: 100,
        group_name: 'Track Series',
        group_name_cn: '田径系列',
        event_count: 3,
        events: [
          {
            id: 101,
            name: 'Track Night 1',
            chinese_name: '田径一',
            date: '2025-05-03',
            time: '7:00 PM',
            location: 'Track Field',
            chinese_location: '田径场',
            image: null,
            image_position: null,
            is_highlight: false,
          },
          {
            id: 102,
            name: 'Track Night 2',
            chinese_name: '田径二',
            date: '2025-05-05',
            time: '7:00 PM',
            location: 'Track Field',
            chinese_location: '田径场',
            image: '/img/track2.jpg',
            image_position: 'top',
            is_highlight: true,
          },
          {
            id: 103,
            name: 'Track Night 3',
            chinese_name: '田径三',
            date: '2025-05-07',
            time: '7:00 PM',
            location: 'Track Field',
            chinese_location: '田径场',
            image: null,
            image_position: null,
            is_highlight: false,
          },
        ],
      },
      {
        // Single-event group: should be converted to a standalone event
        parent_event_id: 200,
        group_name: 'Solo Group',
        group_name_cn: '单独组',
        event_count: 1,
        events: [
          {
            id: 201,
            name: 'Solo Group Event',
            chinese_name: '单独活动',
            date: '2025-04-01',
            time: '8:00 AM',
            location: 'Queens',
            chinese_location: '皇后区',
            image: null,
            status: 'Past',
            is_highlight: false,
          },
        ],
      },
    ],
    standalone_events: [
      {
        id: 1,
        name: 'Brooklyn Half',
        chinese_name: '布鲁克林半马',
        date: '2025-05-17',
        time: '7:00 am',
        location: 'Brooklyn',
        chinese_location: '布鲁克林',
        description: 'Half marathon',
        chinese_description: '半程马拉松',
        image: '/img/bk.jpg',
        image_position: 'center',
        signup_link: null,
        status: 'Completed',
        is_highlight: true,
        is_recurring: false,
        parent_event_id: null,
        group_name: null,
        group_name_cn: null,
      },
      {
        id: 2,
        name: 'Central Park Run',
        chinese_name: '中央公园跑',
        date: '2025-05-10',
        time: '6:30 PM',
        location: 'Central-Park',
        chinese_location: '中央公园',
        description: null,
        chinese_description: null,
        image: null,
        status: 'Past',
        is_highlight: true,
      },
      {
        id: 3,
        name: 'Winter Marathon',
        chinese_name: '冬季马拉松',
        date: '2025-01-05',
        time: null,
        location: 'Queens',
        chinese_location: '皇后区',
        image: '/img/old.jpg',
        status: 'Cancelled',
        is_highlight: false,
      },
      {
        id: 4,
        name: 'Undated Fun Run',
        chinese_name: '欢乐跑',
        date: 'not-a-date',
        time: '9:00 am',
        location: 'Bronx',
        chinese_location: '布朗克斯',
        image: null,
        status: 'Past',
        is_highlight: false,
      },
    ],
  };
}

// --- Helpers ----------------------------------------------------------------

function setAuth(user = { uid: 'user-1' }) {
  useAuth.mockReturnValue({ currentUser: user, loading: false });
}

function setAdmin(adminModeEnabled) {
  useAdmin.mockReturnValue({
    isAdmin: adminModeEnabled,
    adminModeEnabled,
    toggleAdminMode: jest.fn(),
    memberData: null,
    loading: false,
  });
}

function renderPage(route = '/highlights') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <HighlightsPage />
    </MemoryRouter>
  );
}

async function renderLoaded(route = '/highlights') {
  const utils = renderPage(route);
  await screen.findAllByText('Brooklyn Half');
  await waitFor(() => expect(getBatchEngagement).toHaveBeenCalled());
  await act(async () => {});
  return utils;
}

async function selectFilterOption(labelText, optionText) {
  fireEvent.mouseDown(screen.getAllByLabelText(labelText)[0]);
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByText(optionText));
  // Wait for the menu to fully unmount (it stays in the DOM, aria-hidden,
  // during the close transition, which confuses subsequent label queries)
  await waitFor(() =>
    expect(screen.queryAllByRole('listbox', { hidden: true })).toHaveLength(0)
  );
}

let consoleErrorSpy;

beforeEach(() => {
  jest.clearAllMocks();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  dndState.contextProps = null;
  dndState.draggables.length = 0;
  dndState.droppables.length = 0;
  dndState.transformId = undefined;
  dndState.draggingId = undefined;

  setAuth();
  setAdmin(false);

  getHighlightsGrouped.mockResolvedValue(makeGroupedData());
  getBatchEngagement.mockResolvedValue({
    engagements: { 1: { like_count: 5 }, 100: { like_count: 2 } },
  });
  mergeEventsToGroup.mockResolvedValue({
    parent_event_id: 100,
    message: 'Merged successfully',
  });
  removeEventFromGroup.mockResolvedValue({});
  undoGroupMerge.mockResolvedValue({});
  deleteEvent.mockResolvedValue({});
  createEvent.mockResolvedValue({ id: 999 });
  toggleSeriesParent.mockResolvedValue({ message: 'Series parent toggled' });

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// --- Rendering --------------------------------------------------------------

describe('rendering', () => {
  test('renders featured memories (top 3 highlights across standalone and group events)', async () => {
    await renderLoaded();

    expect(screen.getByText('Featured Memories')).toBeInTheDocument();
    // Featured = is_highlight events sorted by date desc: 1, 2, 102
    expect(screen.getAllByText('Brooklyn Half')).toHaveLength(2); // featured + memories
    expect(screen.getAllByText('Central Park Run')).toHaveLength(2);
    expect(screen.getByText('Track Night 2')).toBeInTheDocument(); // featured only
    // Non-highlight events are not featured
    expect(screen.getAllByText('Winter Marathon')).toHaveLength(1); // memories only
  });

  test('renders memory cards with date bubbles and a View Details CTA', async () => {
    await renderLoaded();

    // Date bubble for Brooklyn Half: 17 / MAY (featured + memory card)
    expect(screen.getAllByText('17').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MAY').length).toBeGreaterThanOrEqual(2); // May 17 + May 10
    expect(screen.getByText('JAN')).toBeInTheDocument(); // Jan 5
    expect(screen.getByText('APR')).toBeInTheDocument(); // Apr 1 (converted single group)
    // Date · time meta row
    expect(screen.getAllByText('2025-05-17 · 7:00 am').length).toBeGreaterThanOrEqual(1);
    // Unparseable date renders no bubble but still shows the raw date in the meta row
    expect(screen.getAllByText(/not-a-date/).length).toBeGreaterThanOrEqual(1);
    // Past events carry the MEMORY chip
    expect(screen.getAllByText('MEMORY 回忆').length).toBeGreaterThanOrEqual(1);
    // Standalone memory cards offer the outlined View Details CTA
    const winterCard = screen.getByText('Winter Marathon').closest('[data-testid="event-card"]');
    expect(
      within(winterCard).getByRole('button', { name: 'View Details 查看详情' })
    ).toBeInTheDocument();
  });

  test('renders multi-event group card and converts single-event groups to standalone', async () => {
    await renderLoaded();

    const groupCards = screen.getAllByTestId('event-group-card');
    expect(groupCards).toHaveLength(1);
    expect(groupCards[0]).toHaveTextContent('Track Series');
    // Group card gets its engagement data
    expect(groupCards[0].getAttribute('data-engagement')).toContain('like_count');
    // Single-event group rendered as a standalone memory card, not a group
    expect(screen.getByText('Solo Group Event')).toBeInTheDocument();
  });

  test('renders engagement bars for standalone event cards', async () => {
    await renderLoaded();
    // Event 1 is both featured and a memory card; each EventCard renders an
    // engagement bar (the bar fetches its own data via the API)
    const bars = screen.getAllByTestId('engagement-1');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  test('renders nothing crashing when API returns empty payload and skips engagement fetch', async () => {
    getHighlightsGrouped.mockResolvedValue({ groups: [], standalone_events: [] });
    renderPage();
    await waitFor(() => expect(getHighlightsGrouped).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('event-group-card')).not.toBeInTheDocument();
    expect(getBatchEngagement).not.toHaveBeenCalled();
  });

  test('handles missing groups/standalone keys in payload', async () => {
    getHighlightsGrouped.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(getHighlightsGrouped).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('event-group-card')).not.toBeInTheDocument();
  });

  test('survives getHighlightsGrouped failure', async () => {
    getHighlightsGrouped.mockRejectedValue(new Error('server down'));
    renderPage();
    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error refreshing events:',
        expect.any(Error)
      )
    );
    expect(screen.getByText('Memories')).toBeInTheDocument();
  });

  test('survives engagement fetch failure', async () => {
    getBatchEngagement.mockRejectedValue(new Error('engagement down'));
    renderPage();
    await screen.findAllByText('Brooklyn Half');
    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching engagement data:',
        expect.any(Error)
      )
    );
  });

  test('image load errors swap in the shared fallback image', async () => {
    await renderLoaded();
    const img = screen.getAllByTestId('event-card-image')[0];
    fireEvent.error(img);
    expect(img.src).toContain('/images/placeholder-event.jpg');
  });
});

// --- Filters ----------------------------------------------------------------

describe('filters', () => {
  test('date filter narrows memories (last week / last month / last 3 months)', async () => {
    await renderLoaded();

    await selectFilterOption('Date', 'Last Week');
    expect(screen.getAllByText('Brooklyn Half').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();
    expect(screen.queryByText('Solo Group Event')).not.toBeInTheDocument();

    await selectFilterOption('Date', 'Last Month');
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();
    expect(screen.queryByText('Solo Group Event')).not.toBeInTheDocument();

    await selectFilterOption('Date', 'Last 3 Months');
    expect(screen.getByText('Solo Group Event')).toBeInTheDocument();
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();

    await selectFilterOption('Date', 'All Dates');
    expect(screen.getByText('Winter Marathon')).toBeInTheDocument();
  });

  test('location filter matches case-insensitively and can be cleared', async () => {
    await renderLoaded();

    await selectFilterOption('Location', 'Brooklyn');
    expect(screen.getAllByText('Brooklyn Half').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();
    expect(screen.queryByText('Solo Group Event')).not.toBeInTheDocument();
    // Group cards are not filtered
    expect(screen.getByTestId('event-group-card')).toBeInTheDocument();

    await selectFilterOption('Location', 'Central Park');
    expect(screen.getAllByText('Central Park Run').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();

    await selectFilterOption('Location', 'All Locations');
    expect(screen.getByText('Winter Marathon')).toBeInTheDocument();
  });

  test('status filter shows only matching statuses', async () => {
    await renderLoaded();

    await selectFilterOption('Status', 'Completed');
    expect(screen.getAllByText('Brooklyn Half').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();
    expect(screen.queryByText('Solo Group Event')).not.toBeInTheDocument();

    await selectFilterOption('Status', 'Cancelled');
    expect(screen.getByText('Winter Marathon')).toBeInTheDocument();
    expect(screen.queryByText('Solo Group Event')).not.toBeInTheDocument();

    await selectFilterOption('Status', 'All Status');
    expect(screen.getByText('Solo Group Event')).toBeInTheDocument();
  });

  test('distance filter is selectable and does not remove events', async () => {
    await renderLoaded();
    await selectFilterOption('Distance', '5K');
    expect(screen.getByText('Winter Marathon')).toBeInTheDocument();
    expect(screen.getByText('Solo Group Event')).toBeInTheDocument();
  });
});

// --- View details / detail modal ---------------------------------------------

describe('event detail modal', () => {
  test('clicking a memory card View Details opens EventDetailModal with the event', async () => {
    await renderLoaded();

    const card = screen.getByText('Winter Marathon').closest('.MuiCard-root');
    fireEvent.click(within(card).getByRole('button', { name: /View Details/ }));

    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '3');
    expect(modal).toHaveAttribute('data-event-name', 'Winter Marathon');

    fireEvent.click(screen.getByText('close-detail'));
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });

  test('clicking a featured card opens the modal', async () => {
    await renderLoaded();
    // Featured card renders event.title; the first "Brooklyn Half" is featured
    fireEvent.click(screen.getAllByText('Brooklyn Half')[0]);
    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '1');
  });

  test('onEventUpdate updates the modal and event lists', async () => {
    await renderLoaded();

    const card = screen.getByText('Winter Marathon').closest('.MuiCard-root');
    fireEvent.click(card);
    await screen.findByTestId('event-detail-modal');

    fireEvent.click(screen.getByText('update-detail'));
    expect(screen.getByTestId('event-detail-modal')).toHaveAttribute(
      'data-event-name',
      'Updated Name'
    );
    // The memories list reflects the update
    expect(screen.getByText('Updated Name')).toBeInTheDocument();
    expect(screen.queryByText('Winter Marathon')).not.toBeInTheDocument();
  });
});

// --- Deep links ---------------------------------------------------------------

describe('deep-link ?event= param', () => {
  test('opens modal for a standalone event', async () => {
    renderPage('/highlights?event=1');
    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '1');
  });

  test('opens modal for a featured (grouped highlight) event', async () => {
    renderPage('/highlights?event=102');
    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '102');
  });

  test('opens modal for a non-featured group event', async () => {
    renderPage('/highlights?event=101');
    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '101');
    expect(modal).toHaveAttribute('data-event-name', 'Track Night 1');
  });

  test('ignores non-numeric event param', async () => {
    await renderLoaded('/highlights?event=abc');
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });

  test('ignores unknown event id', async () => {
    await renderLoaded('/highlights?event=55555');
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });
});

// --- Group gallery -------------------------------------------------------------

describe('group gallery modal', () => {
  test('clicking a group card opens the gallery; events inside open the detail modal', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('event-group-card'));
    const gallery = await screen.findByTestId('group-gallery-modal');
    expect(gallery).toHaveTextContent('Track Series');
    expect(screen.getByTestId('group-gallery-count')).toHaveTextContent('3');

    fireEvent.click(screen.getByText('open-group-event'));
    const modal = await screen.findByTestId('event-detail-modal');
    expect(modal).toHaveAttribute('data-event-id', '101');

    fireEvent.click(screen.getByText('close-detail'));
    // Gallery stays open after closing the event detail
    expect(screen.getByTestId('group-gallery-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-group-gallery'));
    expect(screen.queryByTestId('group-gallery-modal')).not.toBeInTheDocument();
  });

  test('removing events from a group updates it optimistically, then dissolves it', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('event-group-card'));
    await screen.findByTestId('group-gallery-modal');

    // Remove first event (3 -> 2): gallery stays open with updated count
    fireEvent.click(screen.getByText('remove-group-event'));
    await waitFor(() =>
      expect(removeEventFromGroup).toHaveBeenCalledWith(101, 'user-1')
    );
    expect(screen.getByTestId('group-gallery-count')).toHaveTextContent('2');

    // Remove another (2 -> 1): group dissolves and gallery closes
    fireEvent.click(screen.getByText('remove-group-event'));
    await waitFor(() =>
      expect(removeEventFromGroup).toHaveBeenCalledWith(102, 'user-1')
    );
    await waitFor(() =>
      expect(screen.queryByTestId('group-gallery-modal')).not.toBeInTheDocument()
    );
  });

  test('remove failure logs and refreshes', async () => {
    removeEventFromGroup.mockRejectedValueOnce(new Error('nope'));
    await renderLoaded();

    fireEvent.click(screen.getByTestId('event-group-card'));
    await screen.findByTestId('group-gallery-modal');
    fireEvent.click(screen.getByText('remove-group-event'));

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error removing event from group:',
        expect.any(Error)
      )
    );
    // initial + optimistic-success refresh path skipped; error path refreshes
    expect(getHighlightsGrouped.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// --- Admin gating ----------------------------------------------------------------

describe('admin gating', () => {
  test('non-admin: no drag affordances, no add/menu buttons, dnd disabled', async () => {
    await renderLoaded();

    expect(screen.queryByRole('button', { name: /Add Event/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('DragIndicatorIcon')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('MoreVertIcon')).toHaveLength(0);
    expect(
      screen.queryByText('Long press the drag handle to move events')
    ).not.toBeInTheDocument();

    // dnd hooks registered as disabled, and no sensors wired up
    expect(dndState.draggables.length).toBeGreaterThan(0);
    expect(dndState.draggables.every((d) => d.disabled === true)).toBe(true);
    expect(dndState.droppables.every((d) => d.disabled === true)).toBe(true);
    expect(dndState.contextProps.sensors).toHaveLength(0);
  });

  test('admin: drag handles, add button, per-event menu and hint are present; dnd enabled', async () => {
    setAdmin(true);
    await renderLoaded();

    expect(screen.getByRole('button', { name: /Add Event/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('DragIndicatorIcon').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('MoreVertIcon').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Long press the drag handle to move events')
    ).toBeInTheDocument();

    expect(dndState.draggables.some((d) => d.disabled === false)).toBe(true);
    expect(dndState.droppables.some((d) => d.disabled === false)).toBe(true);
    expect(dndState.contextProps.sensors).toHaveLength(2);

    // Group cards receive the admin flag
    expect(screen.getByTestId('event-group-card')).toHaveAttribute('data-admin', 'true');

    // Clicking a drag handle does not open the event detail modal
    // (EventCard stops propagation from the whole admin-actions cluster)
    const icons = screen.getAllByTestId('DragIndicatorIcon');
    icons.forEach((icon) => fireEvent.click(icon));
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });

  test('dragging state disables card click and applies drag transform', async () => {
    setAdmin(true);
    dndState.draggingId = 3;
    dndState.transformId = 3;
    await renderLoaded();

    const card = screen.getByText('Winter Marathon').closest('.MuiCard-root');
    fireEvent.click(card);
    // Click is ignored while dragging
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });
});

// --- Drag & merge -----------------------------------------------------------------

describe('drag merge (admin)', () => {
  test('drag overlay shows the dragged event name, or fallback for unknown id', async () => {
    setAdmin(true);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragStart({ active: { id: 2 } });
    });
    expect(screen.getByTestId('drag-overlay')).toHaveTextContent('Central Park Run');

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: null });
    });
    expect(mergeEventsToGroup).not.toHaveBeenCalled();

    await act(async () => {
      dndState.contextProps.onDragStart({ active: { id: 99999 } });
    });
    expect(screen.getByTestId('drag-overlay')).toHaveTextContent('Event');
  });

  test('dropping a standalone event onto a group merges it and offers undo', async () => {
    setAdmin(true);
    // Add a second multi-event group so the optimistic update walks past
    // non-matching groups too
    const data = makeGroupedData();
    data.groups.push({
      parent_event_id: 300,
      group_name: 'Other Series',
      group_name_cn: '其他系列',
      event_count: 2,
      events: [
        { id: 301, name: 'Other 1', date: '2025-03-01', is_highlight: false },
        { id: 302, name: 'Other 2', date: '2025-03-02', is_highlight: false },
      ],
    });
    getHighlightsGrouped.mockResolvedValue(data);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragStart({ active: { id: 2 } });
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 100 } });
    });

    await waitFor(() =>
      expect(mergeEventsToGroup).toHaveBeenCalledWith(2, 100, 'user-1')
    );
    const snackbar = screen.getByTestId('undo-snackbar');
    await waitFor(() => expect(snackbar).toHaveAttribute('data-open', 'true'));
    expect(screen.getByTestId('undo-message')).toHaveTextContent('Merged successfully');

    // Undo the merge
    fireEvent.click(screen.getByText('undo-action'));
    await waitFor(() =>
      expect(undoGroupMerge).toHaveBeenCalledWith(100, 2, 'user-1')
    );
    // Closing the snackbar
    fireEvent.click(screen.getByText('close-undo'));
    await waitFor(() =>
      expect(screen.getByTestId('undo-snackbar')).toHaveAttribute('data-open', 'false')
    );
  });

  test('dropping a standalone onto another standalone creates a new group', async () => {
    setAdmin(true);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 1 } });
    });

    await waitFor(() =>
      expect(mergeEventsToGroup).toHaveBeenCalledWith(2, 1, 'user-1')
    );
  });

  test('drop onto itself or with unparsable ids does nothing', async () => {
    setAdmin(true);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 2 } });
      dndState.contextProps.onDragEnd({ active: { id: 'x' }, over: { id: 1 } });
    });
    expect(mergeEventsToGroup).not.toHaveBeenCalled();
  });

  test('drop is ignored when admin mode is off', async () => {
    setAdmin(false);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 1 } });
    });
    expect(mergeEventsToGroup).not.toHaveBeenCalled();
  });

  test('merge requires a logged-in user', async () => {
    setAuth(null);
    setAdmin(true);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 100 } });
    });
    expect(mergeEventsToGroup).not.toHaveBeenCalled();
  });

  test('merge failure logs and refreshes from the server', async () => {
    setAdmin(true);
    mergeEventsToGroup.mockRejectedValueOnce(new Error('merge failed'));
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 100 } });
    });

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error merging events:',
        expect.any(Error)
      )
    );
    expect(getHighlightsGrouped.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('dragging an unknown event onto a group still calls the merge API', async () => {
    setAdmin(true);
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 99999 }, over: { id: 100 } });
    });
    await waitFor(() =>
      expect(mergeEventsToGroup).toHaveBeenCalledWith(99999, 100, 'user-1')
    );
  });

  test('undo failure is logged', async () => {
    setAdmin(true);
    undoGroupMerge.mockRejectedValueOnce(new Error('undo failed'));
    await renderLoaded();

    await act(async () => {
      dndState.contextProps.onDragEnd({ active: { id: 2 }, over: { id: 100 } });
    });
    await waitFor(() => expect(screen.getByText('undo-action')).toBeInTheDocument());

    fireEvent.click(screen.getByText('undo-action'));
    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error undoing merge:',
        expect.any(Error)
      )
    );
  });
});

// --- Share ------------------------------------------------------------------------

describe('share', () => {
  test('copies a deep link to the clipboard and shows confirmation', async () => {
    await renderLoaded();

    const card = screen.getByText('Winter Marathon').closest('.MuiCard-root');
    fireEvent.click(within(card).getByTestId('ShareIcon'));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/highlights?event=3')
      )
    );
    expect(
      await screen.findByText('Copied to clipboard / 已复制到剪贴板')
    ).toBeInTheDocument();
    // Card click did not propagate: no detail modal
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();

    // Close the snackbar via the Alert close button
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Copied to clipboard / 已复制到剪贴板')
      ).not.toBeInTheDocument()
    );
  });

  test('featured cards expose a share button too', async () => {
    await renderLoaded();

    // The first "Brooklyn Half" is the featured card (title)
    const featuredCard = screen.getAllByText('Brooklyn Half')[0].closest('.MuiCard-root');
    fireEvent.click(within(featuredCard).getByTestId('ShareIcon'));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/highlights?event=1')
      )
    );
  });

  test('shows an error snackbar when clipboard write fails', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    await renderLoaded();

    const card = screen.getByText('Winter Marathon').closest('.MuiCard-root');
    fireEvent.click(within(card).getByTestId('ShareIcon'));

    expect(await screen.findByText('Failed to copy / 复制失败')).toBeInTheDocument();

    // Snackbar itself also closes on Escape (Snackbar onClose)
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Failed to copy / 复制失败')).not.toBeInTheDocument()
    );
  });
});

// --- Admin menu: series parent + delete ---------------------------------------------

describe('admin event menu', () => {
  async function openMenuFor(name) {
    const card = screen.getByText(name).closest('.MuiCard-root');
    fireEvent.click(within(card).getByTestId('MoreVertIcon'));
    return screen.findByRole('menu');
  }

  test('mark as series parent calls API and shows undo snackbar without undo action', async () => {
    setAdmin(true);
    await renderLoaded();

    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Mark as Series Parent 设为系列主活动'));

    await waitFor(() =>
      expect(toggleSeriesParent).toHaveBeenCalledWith(3, 'user-1')
    );
    await waitFor(() =>
      expect(screen.getByTestId('undo-snackbar')).toHaveAttribute('data-open', 'true')
    );
    expect(screen.getByTestId('undo-message')).toHaveTextContent('Series parent toggled');
    // No merge undo available for series toggles
    expect(screen.queryByText('undo-action')).not.toBeInTheDocument();
  });

  test('series parent toggle failure is logged', async () => {
    setAdmin(true);
    toggleSeriesParent.mockRejectedValueOnce(new Error('toggle failed'));
    await renderLoaded();

    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Mark as Series Parent 设为系列主活动'));

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error toggling series parent:',
        expect.any(Error)
      )
    );
  });

  test('delete flow: confirm dialog, API call, success snackbar and refresh', async () => {
    setAdmin(true);
    await renderLoaded();

    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Delete Event 删除活动'));

    expect(
      await screen.findByText(/Are you sure you want to delete "Winter Marathon"/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete / 删除' }));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(3, 'user-1'));
    expect(await screen.findByText('Event deleted / 活动已删除')).toBeInTheDocument();
    await waitFor(() =>
      expect(getHighlightsGrouped.mock.calls.length).toBeGreaterThanOrEqual(2)
    );
  });

  test('delete failure shows an error snackbar', async () => {
    setAdmin(true);
    deleteEvent.mockRejectedValueOnce(new Error('delete failed'));
    await renderLoaded();

    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Delete Event 删除活动'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete / 删除' }));

    expect(
      await screen.findByText('Failed to delete event / 删除活动失败')
    ).toBeInTheDocument();
  });

  test('delete dialog can be cancelled or dismissed with Escape', async () => {
    setAdmin(true);
    await renderLoaded();

    // Escape dismisses the dialog (Dialog onClose)
    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Delete Event 删除活动'));
    const dialogText = await screen.findByText(/Are you sure you want to delete/);
    fireEvent.keyDown(dialogText, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument()
    );

    // Cancel button also closes it
    await openMenuFor('Winter Marathon');
    fireEvent.click(screen.getByText('Delete Event 删除活动'));
    await screen.findByText(/Are you sure you want to delete/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel 取消' }));
    await waitFor(() =>
      expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument()
    );
    expect(deleteEvent).not.toHaveBeenCalled();
  });
});

// --- Add event dialog -----------------------------------------------------------------

describe('add event dialog (admin)', () => {
  async function openAddDialog() {
    fireEvent.click(screen.getByRole('button', { name: /Add Event/ }));
    await screen.findByText('Add Highlight Event 添加精选活动');
  }

  test('requires name and date', async () => {
    setAdmin(true);
    await renderLoaded();
    await openAddDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Create 创建' }));
    expect(
      await screen.findByText('Name and date are required / 名称和日期为必填项')
    ).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('requires a logged-in user', async () => {
    setAuth(null);
    setAdmin(true);
    renderPage();
    await waitFor(() => expect(getHighlightsGrouped).toHaveBeenCalled());
    await act(async () => {});
    await openAddDialog();

    fireEvent.change(screen.getByLabelText('Event Name 活动名称 *'), {
      target: { value: 'New Event' },
    });
    fireEvent.change(screen.getByLabelText('Date 日期 *'), {
      target: { value: '2025-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create 创建' }));

    expect(
      await screen.findByText('You must be logged in / 请先登录')
    ).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('creates a Past highlight event, nulling empty fields, and refreshes', async () => {
    setAdmin(true);
    await renderLoaded();
    await openAddDialog();

    fireEvent.change(screen.getByLabelText('Event Name 活动名称 *'), {
      target: { value: 'Spring Gala Run' },
    });
    fireEvent.change(screen.getByLabelText('Chinese Name 中文名称'), {
      target: { value: '春季跑' },
    });
    fireEvent.change(screen.getByLabelText('Date 日期 *'), {
      target: { value: '2025-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Time 时间'), {
      target: { value: '8:00 AM' },
    });
    fireEvent.change(screen.getByLabelText('Location 地点'), {
      target: { value: 'Prospect Park' },
    });
    fireEvent.change(screen.getByLabelText('Description 描述'), {
      target: { value: 'Fun run' },
    });
    fireEvent.change(screen.getByLabelText('Image URL 图片链接'), {
      target: { value: 'https://img/x.jpg' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create 创建' }));

    await waitFor(() =>
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spring Gala Run',
          chinese_name: '春季跑',
          date: '2025-06-01',
          time: '8:00 AM',
          location: 'Prospect Park',
          chinese_location: null, // empty string converted to null
          description: 'Fun run',
          chinese_description: null,
          image: 'https://img/x.jpg',
          status: 'Past',
          is_highlight: true,
        }),
        'user-1'
      )
    );
    expect(await screen.findByText('Event created / 活动已创建')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText('Add Highlight Event 添加精选活动')
      ).not.toBeInTheDocument()
    );
    expect(getHighlightsGrouped.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('shows an error snackbar with the API failure message', async () => {
    setAdmin(true);
    createEvent.mockRejectedValueOnce(new Error('boom'));
    await renderLoaded();
    await openAddDialog();

    fireEvent.change(screen.getByLabelText('Event Name 活动名称 *'), {
      target: { value: 'Broken Event' },
    });
    fireEvent.change(screen.getByLabelText('Date 日期 *'), {
      target: { value: '2025-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create 创建' }));

    expect(
      await screen.findByText('Failed to create event: boom')
    ).toBeInTheDocument();
  });

  test('cancel or Escape closes the dialog without creating', async () => {
    setAdmin(true);
    await renderLoaded();

    // Escape dismisses (Dialog onClose gated on !addEventLoading)
    await openAddDialog();
    fireEvent.keyDown(screen.getByText('Add Highlight Event 添加精选活动'), {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(
        screen.queryByText('Add Highlight Event 添加精选活动')
      ).not.toBeInTheDocument()
    );

    // Cancel button also closes
    await openAddDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel 取消' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Add Highlight Event 添加精选活动')
      ).not.toBeInTheDocument()
    );
    expect(createEvent).not.toHaveBeenCalled();
  });
});
