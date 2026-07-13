import { render, screen, fireEvent } from '@testing-library/react';
import EventCard, { normalizeEvent } from './EventCard';

jest.mock('./EventEngagementBar', () => () => <div data-testid="engagement-bar" />);
jest.mock('./EventGalleryPreview', () => () => <div data-testid="gallery-preview" />);

const baseEvent = {
  id: 1,
  name: 'Saturday Long Run',
  chinese_name: '周六长跑',
  date: '2026-07-19',
  time: '8:00 AM',
  location: 'Central Park',
  chinese_location: '中央公园',
  description: 'Weekly long run with paced groups.',
  image: '/images/2025/20250620_queens_10k.jpg',
  status: 'Upcoming',
  event_type: 'standard',
};

describe('normalizeEvent', () => {
  test('reads snake_case API fields', () => {
    const ev = normalizeEvent(baseEvent);
    expect(ev.name).toBe('Saturday Long Run');
    expect(ev.chineseName).toBe('周六长跑');
    expect(ev.signupLink).toBe('');
  });

  test('reads page-cache camelCase and featured title fields', () => {
    const ev = normalizeEvent({
      id: 2,
      title: 'Team Championship',
      chineseTitle: '团队锦标赛',
      signupLink: 'https://nyrr.org',
      eventType: 'race',
    });
    expect(ev.name).toBe('Team Championship');
    expect(ev.chineseName).toBe('团队锦标赛');
    expect(ev.signupLink).toBe('https://nyrr.org');
    expect(ev.eventType).toBe('race');
  });

  test('reads banner event_* prefixed fields', () => {
    const ev = normalizeEvent({
      event_name: 'Fun Run',
      event_date: '2026-07-04',
      event_signup_link: 'https://example.com',
    });
    expect(ev.name).toBe('Fun Run');
    expect(ev.date).toBe('2026-07-04');
    expect(ev.signupLink).toBe('https://example.com');
  });
});

describe('EventCard', () => {
  test('renders title, chinese title, meta and date bubble', () => {
    render(<EventCard event={baseEvent} />);
    expect(screen.getByText('Saturday Long Run')).toBeInTheDocument();
    expect(screen.getByText('周六长跑')).toBeInTheDocument();
    expect(screen.getByText(/2026-07-19 · 8:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Central Park 中央公园/)).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('JUL')).toBeInTheDocument();
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
  });

  test('whole card click fires onClick', () => {
    const onClick = jest.fn();
    render(<EventCard event={baseEvent} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('event-card'));
    expect(onClick).toHaveBeenCalledWith(baseEvent);
  });

  test('CTA is View Details without signup link and fires onClick', () => {
    const onClick = jest.fn();
    render(<EventCard event={baseEvent} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /View Details/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('CTA is Sign Up when upcoming with signup link and opens it', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    const onClick = jest.fn();
    render(
      <EventCard event={{ ...baseEvent, signup_link: 'https://nyrr.org' }} onClick={onClick} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Sign Up 报名/ }));
    expect(openSpy).toHaveBeenCalledWith('https://nyrr.org', '_blank', 'noopener,noreferrer');
    expect(onClick).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test('past event with signup link falls back to View Details', () => {
    render(
      <EventCard event={{ ...baseEvent, status: 'Past', signup_link: 'https://nyrr.org' }} />
    );
    expect(screen.getByRole('button', { name: /View Details/ })).toBeInTheDocument();
    expect(screen.getByText('MEMORY 回忆')).toBeInTheDocument();
  });

  test('cancelled event shows chip and strikethrough title', () => {
    render(<EventCard event={{ ...baseEvent, status: 'Cancelled' }} />);
    expect(screen.getByText('CANCELLED 已取消')).toBeInTheDocument();
    expect(screen.getByText('Saturday Long Run')).toHaveStyle('text-decoration: line-through');
  });

  test('race and recurring chips render', () => {
    render(<EventCard event={{ ...baseEvent, event_type: 'race', is_recurring: true }} />);
    expect(screen.getByText('RACE 比赛')).toBeInTheDocument();
    expect(screen.getByText('RECURRING')).toBeInTheDocument();
  });

  test('share button fires onShare, not onClick', () => {
    const onShare = jest.fn();
    const onClick = jest.fn();
    render(<EventCard event={baseEvent} onShare={onShare} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText('share event'));
    expect(onShare).toHaveBeenCalledWith(baseEvent);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('renders adminActions in the icon cluster', () => {
    render(<EventCard event={baseEvent} adminActions={<button>edit-me</button>} />);
    expect(screen.getByText('edit-me')).toBeInTheDocument();
  });

  test('engagement bar renders by default and hides when disabled', () => {
    const { rerender } = render(<EventCard event={baseEvent} />);
    expect(screen.getByTestId('engagement-bar')).toBeInTheDocument();
    rerender(<EventCard event={baseEvent} showEngagement={false} />);
    expect(screen.queryByTestId('engagement-bar')).not.toBeInTheDocument();
  });

  test('gallery preview renders only when requested', () => {
    const { rerender } = render(<EventCard event={baseEvent} />);
    expect(screen.queryByTestId('gallery-preview')).not.toBeInTheDocument();
    rerender(<EventCard event={baseEvent} showGalleryPreview />);
    expect(screen.getByTestId('gallery-preview')).toBeInTheDocument();
  });

  test('description renders only in showDescription mode', () => {
    const { rerender } = render(<EventCard event={baseEvent} />);
    expect(screen.queryByText(/Weekly long run/)).not.toBeInTheDocument();
    rerender(<EventCard event={baseEvent} showDescription />);
    expect(screen.getByText(/Weekly long run/)).toBeInTheDocument();
  });

  test('non-interactive preview ignores clicks', () => {
    const onClick = jest.fn();
    render(<EventCard event={baseEvent} onClick={onClick} interactive={false} />);
    fireEvent.click(screen.getByTestId('event-card'));
    fireEvent.click(screen.getByRole('button', { name: /View Details/ }));
    expect(onClick).not.toHaveBeenCalled();
  });

  test('event without id skips engagement and gallery', () => {
    render(<EventCard event={{ name: 'Draft', date: '2026-08-01' }} showGalleryPreview />);
    expect(screen.queryByTestId('engagement-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gallery-preview')).not.toBeInTheDocument();
  });
});
