import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventModal from './EventModal';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Compute the date string the same way the component does, so the
// assertion is timezone-independent ('2999-05-01' parses as UTC midnight).
const formatEventDate = (d) =>
  new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const futureEvent = {
  event_name: 'Spring 5K',
  event_chinese_name: '春季五公里',
  event_date: '2999-05-01',
  event_time: '8:00 AM',
  event_location: 'Central Park',
  event_chinese_location: '中央公园',
  event_description: 'A fun spring race.',
  event_chinese_description: '有趣的春季比赛。',
  image_url: 'https://example.com/img.jpg',
  image_position: 'top center',
  event_signup_link: 'https://example.com/signup',
};

describe('EventModal', () => {
  let openSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  test('renders nothing when event is null', () => {
    render(<EventModal open onClose={jest.fn()} event={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders nothing visible when closed', () => {
    render(<EventModal open={false} onClose={jest.fn()} event={futureEvent} />);
    expect(screen.queryByText('Spring 5K')).not.toBeInTheDocument();
  });

  test('renders full event details with event_* fields', () => {
    render(<EventModal open onClose={jest.fn()} event={futureEvent} />);
    expect(screen.getByText('Spring 5K')).toBeInTheDocument();
    expect(screen.getByText('春季五公里')).toBeInTheDocument();
    expect(screen.getByText(formatEventDate('2999-05-01'))).toBeInTheDocument();
    expect(screen.getByText('8:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Central Park')).toBeInTheDocument();
    expect(screen.getByText('中央公园')).toBeInTheDocument();
    expect(screen.getByText('A fun spring race.')).toBeInTheDocument();
    expect(screen.getByText('有趣的春季比赛。')).toBeInTheDocument();
    expect(screen.getByAltText('Spring 5K')).toBeInTheDocument();
  });

  test('renders with legacy plain field names (fallback branches)', () => {
    render(
      <EventModal
        open
        onClose={jest.fn()}
        event={{
          name: 'Legacy Run',
          date: '2999-06-15',
          time: '7:00 AM',
          location: 'Prospect Park',
          description: 'Legacy description.',
          signup_link: 'https://example.com/legacy',
        }}
      />
    );
    expect(screen.getByText('Legacy Run')).toBeInTheDocument();
    expect(screen.getByText(formatEventDate('2999-06-15'))).toBeInTheDocument();
    expect(screen.getByText('Prospect Park')).toBeInTheDocument();
    expect(screen.getByText('Legacy description.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Up/ })).toBeInTheDocument();
  });

  test('minimal event: no image, date, time, location, description, or signup', () => {
    render(
      <EventModal open onClose={jest.fn()} event={{ name: 'Bare Event' }} />
    );
    expect(screen.getByText('Bare Event')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CalendarTodayIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('AccessTimeIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('LocationOnIcon')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign Up/ })).not.toBeInTheDocument();
  });

  test('close button over the image calls onClose', () => {
    const onClose = jest.fn();
    render(<EventModal open onClose={onClose} event={futureEvent} />);
    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    expect(onClose).toHaveBeenCalled();
  });

  test('close button in title used when no image', () => {
    const onClose = jest.fn();
    render(
      <EventModal
        open
        onClose={onClose}
        event={{ name: 'No Image Event', date: '2999-01-01' }}
      />
    );
    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    expect(onClose).toHaveBeenCalled();
  });

  test('broken image falls back to placeholder', () => {
    render(<EventModal open onClose={jest.fn()} event={futureEvent} />);
    const img = screen.getByAltText('Spring 5K');
    fireEvent.error(img);
    expect(img.src).toContain('/placeholder-event.png');
  });

  test('Sign Up opens signup link in a new tab for upcoming events', () => {
    render(<EventModal open onClose={jest.fn()} event={futureEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /Sign Up/ }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/signup', '_blank');
  });

  test('Sign Up hidden for past events even with signup link', () => {
    render(
      <EventModal
        open
        onClose={jest.fn()}
        event={{ ...futureEvent, event_date: '2020-01-01' }}
      />
    );
    expect(screen.queryByRole('button', { name: /Sign Up/ })).not.toBeInTheDocument();
  });

  test('Sign Up shown when event has signup link but no date', () => {
    render(
      <EventModal
        open
        onClose={jest.fn()}
        event={{ name: 'Dateless', signup_link: 'https://example.com/x' }}
      />
    );
    expect(screen.getByRole('button', { name: /Sign Up/ })).toBeInTheDocument();
  });

  test('View All Events closes modal and navigates to calendar', async () => {
    const onClose = jest.fn();
    render(<EventModal open onClose={onClose} event={futureEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /View All Events/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
  });
});
