import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReactionPicker from './ReactionPicker';
import { useAuth } from '../context/AuthContext';
import { toggleReaction } from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api', () => ({
  toggleReaction: jest.fn(),
  ALLOWED_EMOJIS: ['🏃', '🎉', '💪', '👏', '❤️', '🔥', '🐝', '⭐'],
}));

const reactions = [
  { emoji: '🏃', count: 2, user_reacted: false },
  { emoji: '❤️', count: 0, user_reacted: false },
  { emoji: '🔥', count: 1, user_reacted: true },
];

const openFullPicker = () => {
  fireEvent.click(
    screen.getByTestId('AddReactionOutlinedIcon').closest('button')
  );
};

describe('ReactionPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  });

  test('renders with default props (no reactions)', () => {
    render(<ReactionPicker eventId={1} />);
    expect(screen.getByTestId('AddReactionOutlinedIcon')).toBeInTheDocument();
    expect(screen.queryByText(/🏃/)).not.toBeInTheDocument();
  });

  test('full variant renders only reactions with count > 0', () => {
    render(<ReactionPicker eventId={1} reactions={reactions} />);
    expect(screen.getByText('🏃 2')).toBeInTheDocument();
    expect(screen.getByText('🔥 1')).toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
  });

  test('clicking an existing chip toggles that reaction and calls onUpdate', async () => {
    const onUpdate = jest.fn();
    const updated = [{ emoji: '🏃', count: 3, user_reacted: true }];
    toggleReaction.mockResolvedValue({ reactions: updated });

    render(<ReactionPicker eventId={5} reactions={reactions} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('🏃 2'));

    expect(toggleReaction).toHaveBeenCalledWith(5, '🏃', 'user-1');
    expect(await screen.findByText('🏃 3')).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  test('opens popover and picks a new emoji', async () => {
    toggleReaction.mockResolvedValue({
      reactions: [{ emoji: '🎉', count: 1, user_reacted: true }],
    });
    render(<ReactionPicker eventId={2} reactions={reactions} />);

    openFullPicker();
    expect(screen.getByText('Pick a reaction')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🎉' }));
    expect(toggleReaction).toHaveBeenCalledWith(2, '🎉', 'user-1');

    expect(await screen.findByText('🎉 1')).toBeInTheDocument();
    // Popover closes after picking
    await waitFor(() =>
      expect(screen.queryByText('Pick a reaction')).not.toBeInTheDocument()
    );
  });

  test('anonymous user passes undefined uid', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    toggleReaction.mockResolvedValue({ reactions: [] });
    render(<ReactionPicker eventId={3} reactions={reactions} />);
    fireEvent.click(screen.getByText('🔥 1'));
    await waitFor(() =>
      expect(toggleReaction).toHaveBeenCalledWith(3, '🔥', undefined)
    );
  });

  test('calls onError on API failure and closes popover', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onError = jest.fn();
    toggleReaction.mockRejectedValue(new Error('boom'));

    render(<ReactionPicker eventId={1} reactions={reactions} onError={onError} />);
    openFullPicker();
    fireEvent.click(screen.getByRole('button', { name: '👏' }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to react / 反应失败')
    );
    await waitFor(() =>
      expect(screen.queryByText('Pick a reaction')).not.toBeInTheDocument()
    );
    consoleSpy.mockRestore();
  });

  test('failure without onError does not crash', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    toggleReaction.mockRejectedValue(new Error('boom'));
    render(<ReactionPicker eventId={1} reactions={reactions} />);
    fireEvent.click(screen.getByText('🏃 2'));
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(screen.getByText('🏃 2')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('disabled: add-reaction button is disabled and popover never opens', () => {
    render(<ReactionPicker eventId={1} reactions={reactions} disabled />);
    const addBtn = screen.getByTestId('AddReactionOutlinedIcon').closest('button');
    expect(addBtn).toBeDisabled();
    fireEvent.click(addBtn);
    expect(screen.queryByText('Pick a reaction')).not.toBeInTheDocument();
  });

  test('compact variant renders active reactions and toggles on click', async () => {
    toggleReaction.mockResolvedValue({
      reactions: [{ emoji: '🏃', count: 3, user_reacted: true }],
    });
    render(<ReactionPicker eventId={4} reactions={reactions} compact />);
    expect(screen.getByText('🏃')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('🏃'));
    expect(toggleReaction).toHaveBeenCalledWith(4, '🏃', 'user-1');
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  test('compact variant opens popover with all emojis and picks one', async () => {
    toggleReaction.mockResolvedValue({
      reactions: [{ emoji: '🐝', count: 1, user_reacted: true }],
    });
    render(<ReactionPicker eventId={4} reactions={reactions} compact />);
    openFullPicker();
    const beeBtn = screen.getByRole('button', { name: '🐝' });
    expect(screen.getByRole('button', { name: '⭐' })).toBeInTheDocument();

    // Clicking inside the popover stops propagation without closing it
    fireEvent.click(beeBtn.parentElement);
    expect(screen.getByRole('button', { name: '⭐' })).toBeInTheDocument();

    fireEvent.click(beeBtn);
    expect(toggleReaction).toHaveBeenCalledWith(4, '🐝', 'user-1');
    expect(await screen.findByText('🐝')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '⭐' })).not.toBeInTheDocument()
    );
  });

  test('compact disabled ignores reaction clicks', () => {
    render(<ReactionPicker eventId={4} reactions={reactions} compact disabled />);
    fireEvent.click(screen.getByText('🏃'));
    expect(toggleReaction).not.toHaveBeenCalled();
  });

  test('syncs local reactions when the prop changes', () => {
    const { rerender } = render(<ReactionPicker eventId={1} reactions={reactions} />);
    expect(screen.getByText('🏃 2')).toBeInTheDocument();
    rerender(
      <ReactionPicker
        eventId={1}
        reactions={[{ emoji: '⭐', count: 9, user_reacted: false }]}
      />
    );
    expect(screen.getByText('⭐ 9')).toBeInTheDocument();
    expect(screen.queryByText('🏃 2')).not.toBeInTheDocument();
  });

  test('closing the popover via escape resets anchor', async () => {
    render(<ReactionPicker eventId={1} reactions={reactions} />);
    openFullPicker();
    expect(screen.getByText('Pick a reaction')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Pick a reaction')).not.toBeInTheDocument()
    );
  });
});
