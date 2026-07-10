import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventGroupCard from './EventGroupCard';
import { updateEvent } from '../api';
import { useAuth } from '../context/AuthContext';

jest.mock('../api', () => ({ updateEvent: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('./EventGalleryPreview', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'gallery-preview' }, `preview:${props.eventId}`);
});

jest.mock('./EventEngagementBar', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'engagement-bar' }, `engagement:${props.eventId}`);
});

jest.mock('./ImagePositionEditor', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'position-editor' },
    React.createElement('span', { 'data-testid': 'editor-position' }, props.currentPosition),
    React.createElement('button', { onClick: () => props.onSave('10% 20%') }, 'save-pos'),
    React.createElement('button', { onClick: () => props.onPositionSaved('10% 20%') }, 'saved-pos')
  );
});

const GROUP = {
  parent_event_id: 100,
  cover_event_id: 200,
  group_name: 'Brooklyn Half Series',
  group_name_cn: '布鲁克林半马系列',
  cover_image: '/img/cover.jpg',
  cover_image_position: '30% 40%',
  event_count: 3,
  most_recent_date: '2025-05-17',
  events: [
    { id: 3, date: '2025-05-17' },
    { id: 2, date: '2024-05-18' },
    { id: 1, date: '2023-05-20' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
});

describe('EventGroupCard', () => {
  test('renders group names, badges, dates and year range', () => {
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} />);
    expect(screen.getByText('Brooklyn Half Series')).toBeInTheDocument();
    expect(screen.getByText('布鲁克林半马系列')).toBeInTheDocument();
    expect(screen.getByText('3 Events')).toBeInTheDocument(); // mobile badge
    expect(screen.getByText('3')).toBeInTheDocument(); // desktop badge
    expect(screen.getByRole('button', { name: 'View All 3 Events' })).toBeInTheDocument();
    expect(screen.getByText('3 events from 2023 to 2025')).toBeInTheDocument();
    expect(screen.getAllByText('May 2025')).toHaveLength(2); // mobile + desktop
    expect(screen.getByText('to present')).toBeInTheDocument();
  });

  test('passes parent event id to gallery preview and engagement bar', () => {
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} />);
    expect(screen.getByTestId('gallery-preview')).toHaveTextContent('preview:100');
    expect(screen.getByTestId('engagement-bar')).toHaveTextContent('engagement:100');
  });

  test('clicking the card calls onGroupClick with the group', () => {
    const onGroupClick = jest.fn();
    render(<EventGroupCard group={GROUP} onGroupClick={onGroupClick} />);
    fireEvent.click(screen.getByText('Brooklyn Half Series'));
    expect(onGroupClick).toHaveBeenCalledWith(GROUP);
  });

  test('non-admin renders cover images with position and error fallback', () => {
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} />);
    const imgs = screen.getAllByAltText('Brooklyn Half Series');
    expect(imgs).toHaveLength(2); // mobile + desktop
    imgs.forEach((img) => {
      expect(img).toHaveAttribute('src', '/img/cover.jpg');
      expect(img).toHaveStyle({ objectPosition: '30% 40%' });
    });
    fireEvent.error(imgs[0]);
    expect(imgs[0]).toHaveAttribute('src', '/images/2025/20250517_bk_half.jpg');
  });

  test('falls back to default cover image and position when missing', () => {
    const group = { ...GROUP, cover_image: null, cover_image_position: null };
    render(<EventGroupCard group={group} onGroupClick={jest.fn()} />);
    const imgs = screen.getAllByAltText('Brooklyn Half Series');
    imgs.forEach((img) => {
      expect(img).toHaveAttribute('src', '/images/2025/20250517_bk_half.jpg');
      expect(img).toHaveStyle({ objectPosition: 'center center' });
    });
    // no admin editor without cover image even in admin mode
    expect(screen.queryByTestId('position-editor')).not.toBeInTheDocument();
  });

  test('omits Chinese name when not provided', () => {
    const group = { ...GROUP, group_name_cn: null };
    render(<EventGroupCard group={group} onGroupClick={jest.fn()} />);
    expect(screen.queryByText('布鲁克林半马系列')).not.toBeInTheDocument();
  });

  test('admin mode renders position editors seeded with the cover position', () => {
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} adminModeEnabled />);
    const editors = screen.getAllByTestId('position-editor');
    expect(editors).toHaveLength(2); // mobile + desktop
    screen.getAllByTestId('editor-position').forEach((el) =>
      expect(el).toHaveTextContent('30% 40%')
    );
  });

  test('saving a position updates the cover event via API', async () => {
    updateEvent.mockResolvedValue({});
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} adminModeEnabled />);
    fireEvent.click(screen.getAllByText('save-pos')[0]);
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(200, { image_position: '10% 20%' }, 'admin-1')
    );
  });

  test('falls back to parent_event_id when cover_event_id is missing', async () => {
    updateEvent.mockResolvedValue({});
    const group = { ...GROUP, cover_event_id: null };
    render(<EventGroupCard group={group} onGroupClick={jest.fn()} adminModeEnabled />);
    fireEvent.click(screen.getAllByText('save-pos')[1]);
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(100, { image_position: '10% 20%' }, 'admin-1')
    );
  });

  test('onPositionSaved updates local state and notifies the parent', () => {
    const onPositionSaved = jest.fn();
    render(
      <EventGroupCard
        group={GROUP}
        onGroupClick={jest.fn()}
        adminModeEnabled
        onPositionSaved={onPositionSaved}
      />
    );
    fireEvent.click(screen.getAllByText('saved-pos')[0]); // mobile editor
    fireEvent.click(screen.getAllByText('saved-pos')[1]); // desktop editor
    expect(onPositionSaved).toHaveBeenCalledWith('10% 20%');
    expect(onPositionSaved).toHaveBeenCalledTimes(2);
    screen.getAllByTestId('editor-position').forEach((el) =>
      expect(el).toHaveTextContent('10% 20%')
    );
  });

  test('onPositionSaved works without a parent callback', () => {
    render(<EventGroupCard group={GROUP} onGroupClick={jest.fn()} adminModeEnabled />);
    fireEvent.click(screen.getAllByText('saved-pos')[1]);
    screen.getAllByTestId('editor-position').forEach((el) =>
      expect(el).toHaveTextContent('10% 20%')
    );
  });
});
