import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventEngagementBar from './EventEngagementBar';
import { useAuth } from '../context/AuthContext';
import { getEventEngagement, toggleLike, toggleReaction } from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api', () => ({
  getEventEngagement: jest.fn(),
  toggleLike: jest.fn(),
  toggleReaction: jest.fn(),
  getEventLikes: jest.fn(),
  ALLOWED_EMOJIS: ['🏃', '🎉', '💪', '👏', '❤️', '🔥', '🐝', '⭐'],
}));

const engagement = {
  likes_enabled: true,
  likes: { count: 5, user_liked: false },
  reactions_enabled: true,
  reactions: [{ emoji: '🎉', count: 2, user_reacted: false }],
  comments_enabled: true,
  comment_count: 7,
};

describe('EventEngagementBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  });

  test('fetches engagement when no initialData and renders all sections', async () => {
    const onDataLoaded = jest.fn();
    getEventEngagement.mockResolvedValue(engagement);
    render(<EventEngagementBar eventId={1} onDataLoaded={onDataLoaded} />);

    expect(await screen.findByText('5')).toBeInTheDocument(); // like count
    expect(screen.getByText('🎉')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // reaction count
    expect(screen.getByText('7')).toBeInTheDocument(); // comment count
    expect(getEventEngagement).toHaveBeenCalledWith(1, 'user-1');
    expect(onDataLoaded).toHaveBeenCalledWith(engagement);
  });

  test('uses initialData without fetching', () => {
    render(<EventEngagementBar eventId={1} initialData={engagement} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(getEventEngagement).not.toHaveBeenCalled();
  });

  test('fetch success without onDataLoaded does not crash', async () => {
    getEventEngagement.mockResolvedValue(engagement);
    render(<EventEngagementBar eventId={1} />);
    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  test('shows error message when fetch fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventEngagement.mockRejectedValue(new Error('boom'));
    render(<EventEngagementBar eventId={1} />);
    expect(await screen.findByText('Failed to load')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('renders nothing when fetch resolves empty', async () => {
    getEventEngagement.mockResolvedValue(null);
    const { container } = render(<EventEngagementBar eventId={1} />);
    await waitFor(() => expect(getEventEngagement).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('hides disabled sections', () => {
    render(
      <EventEngagementBar
        eventId={1}
        initialData={{
          ...engagement,
          likes_enabled: false,
          reactions_enabled: false,
          comments_enabled: false,
        }}
      />
    );
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByText('🎉')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  test('like update flows back into engagement state', async () => {
    toggleLike.mockResolvedValue({ count: 6, user_liked: true });
    render(<EventEngagementBar eventId={1} initialData={engagement} />);

    fireEvent.click(screen.getByText('5')); // compact LikeButton
    expect(await screen.findByText('6')).toBeInTheDocument();
    expect(toggleLike).toHaveBeenCalledWith(1, 'user-1');
  });

  test('reaction update flows back into engagement state', async () => {
    toggleReaction.mockResolvedValue({
      reactions: [{ emoji: '🎉', count: 3, user_reacted: true }],
    });
    render(<EventEngagementBar eventId={1} initialData={engagement} />);

    fireEvent.click(screen.getByText('🎉'));
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(toggleReaction).toHaveBeenCalledWith(1, '🎉', 'user-1');
  });

  test('clicks on the bar container are swallowed (stopPropagation)', () => {
    const outerClick = jest.fn();
    render(
      <div onClick={outerClick}>
        <EventEngagementBar eventId={1} initialData={engagement} />
      </div>
    );
    fireEvent.click(screen.getByText('7')); // comment count area
    expect(outerClick).not.toHaveBeenCalled();
  });

  test('shows loading skeletons while fetching', () => {
    getEventEngagement.mockReturnValue(new Promise(() => {}));
    const { container } = render(<EventEngagementBar eventId={1} />);
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBe(3);
  });
});
