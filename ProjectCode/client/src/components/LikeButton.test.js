import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LikeButton from './LikeButton';
import { useAuth } from '../context/AuthContext';
import { toggleLike } from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api', () => ({
  toggleLike: jest.fn(),
  getEventLikes: jest.fn(),
}));

describe('LikeButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: null });
  });

  test('renders with default props (count 0, unliked)', () => {
    render(<LikeButton eventId={1} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByTestId('FavoriteBorderIcon')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  test('renders initial count and unliked icon (default variant)', () => {
    render(<LikeButton eventId={1} initialCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTestId('FavoriteBorderIcon')).toBeInTheDocument();
    expect(screen.queryByTestId('FavoriteIcon')).not.toBeInTheDocument();
  });

  test('renders liked icon when initialLiked is true', () => {
    render(<LikeButton eventId={1} initialCount={2} initialLiked />);
    expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
  });

  test('toggles like optimistically: updates count, icon, and calls onUpdate', async () => {
    const onUpdate = jest.fn();
    toggleLike.mockResolvedValue({ user_liked: true, count: 4 });
    useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });

    render(<LikeButton eventId={7} initialCount={3} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button'));

    expect(toggleLike).toHaveBeenCalledWith(7, 'user-1');
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith({ user_liked: true, count: 4 });
  });

  test('anonymous user passes undefined uid', async () => {
    toggleLike.mockResolvedValue({ user_liked: true, count: 1 });
    render(<LikeButton eventId={9} initialCount={0} />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('1');
    expect(toggleLike).toHaveBeenCalledWith(9, undefined);
  });

  test('calls onError and keeps count on API failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onError = jest.fn();
    toggleLike.mockRejectedValue(new Error('boom'));

    render(<LikeButton eventId={1} initialCount={3} onError={onError} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to like / 点赞失败')
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('failure without onError callback does not crash', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    toggleLike.mockRejectedValue(new Error('boom'));

    render(<LikeButton eventId={1} initialCount={3} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(screen.getByText('3')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('success without onUpdate callback does not crash', async () => {
    toggleLike.mockResolvedValue({ user_liked: true, count: 8 });
    render(<LikeButton eventId={1} initialCount={3} />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('8')).toBeInTheDocument();
  });

  test('disabled default variant disables the icon button', () => {
    render(<LikeButton eventId={1} initialCount={3} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(toggleLike).not.toHaveBeenCalled();
  });

  test('compact variant renders and toggles on click', async () => {
    toggleLike.mockResolvedValue({ user_liked: true, count: 6 });
    render(<LikeButton eventId={2} initialCount={5} compact />);
    expect(screen.getByTestId('FavoriteBorderIcon')).toBeInTheDocument();
    fireEvent.click(screen.getByText('5'));
    expect(await screen.findByText('6')).toBeInTheDocument();
    expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
  });

  test('compact variant liked state renders filled icon', () => {
    render(<LikeButton eventId={2} initialCount={5} compact initialLiked />);
    expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
  });

  test('compact disabled ignores clicks', () => {
    render(<LikeButton eventId={2} initialCount={5} compact disabled />);
    fireEvent.click(screen.getByText('5'));
    expect(toggleLike).not.toHaveBeenCalled();
  });

  test('ignores clicks while a toggle is in flight', async () => {
    let resolveFn;
    toggleLike.mockImplementation(
      () => new Promise((resolve) => { resolveFn = resolve; })
    );
    render(<LikeButton eventId={3} initialCount={0} compact />);
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('0')); // second click during loading
    expect(toggleLike).toHaveBeenCalledTimes(1);
    resolveFn({ user_liked: true, count: 1 });
    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  test('syncs state when initial props change', () => {
    const { rerender } = render(<LikeButton eventId={1} initialCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    rerender(<LikeButton eventId={1} initialCount={10} initialLiked />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
  });
});
