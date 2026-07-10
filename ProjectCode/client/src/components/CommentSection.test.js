import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommentSection from './CommentSection';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getEventComments, getAllEventComments, createComment } from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));
jest.mock('../api', () => ({
  getEventComments: jest.fn(),
  getAllEventComments: jest.fn(),
  createComment: jest.fn(),
}));

// Probe stub for CommentItem so we can drive onUpdate/onDelete/onError.
jest.mock('./CommentItem', () => {
  const React = require('react');
  return function MockCommentItem({ comment, onUpdate, onDelete, onError }) {
    return React.createElement(
      'div',
      { 'data-testid': `comment-${comment.id}` },
      React.createElement('span', null, comment.content),
      React.createElement(
        'button',
        { onClick: () => onUpdate({ ...comment, content: 'edited content' }) },
        `update-${comment.id}`
      ),
      React.createElement(
        'button',
        { onClick: () => onDelete(comment.id) },
        `delete-${comment.id}`
      ),
      React.createElement(
        'button',
        { onClick: () => onError('probe error') },
        `error-${comment.id}`
      )
    );
  };
});

const visibleComment = { id: 1, content: 'First comment', is_hidden: false };
const hiddenComment = { id: 2, content: 'Hidden comment', is_hidden: true };

describe('CommentSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
    useAdmin.mockReturnValue({ adminModeEnabled: false });
    getEventComments.mockResolvedValue([visibleComment]);
  });

  test('shows loading spinner then renders fetched comments with count', async () => {
    render(<CommentSection eventId={1} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByText('First comment')).toBeInTheDocument();
    expect(screen.getByText('Comments (1)')).toBeInTheDocument();
    expect(getEventComments).toHaveBeenCalledWith(1);
  });

  test('reports visible comment count via onCommentCountChange', async () => {
    getEventComments.mockResolvedValue([visibleComment, hiddenComment]);
    const onCommentCountChange = jest.fn();
    render(<CommentSection eventId={1} onCommentCountChange={onCommentCountChange} />);
    await screen.findByText('First comment');
    expect(onCommentCountChange).toHaveBeenCalledWith(1); // hidden excluded
  });

  test('hides hidden comments for non-admins', async () => {
    getEventComments.mockResolvedValue([visibleComment, hiddenComment]);
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    expect(screen.queryByText('Hidden comment')).not.toBeInTheDocument();
    expect(screen.getByText('Comments (1)')).toBeInTheDocument();
  });

  test('admin mode fetches all comments and shows hidden count note', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    getAllEventComments.mockResolvedValue([visibleComment, hiddenComment]);
    render(<CommentSection eventId={3} />);
    expect(await screen.findByText('Hidden comment')).toBeInTheDocument();
    expect(getAllEventComments).toHaveBeenCalledWith(3, 'user-1');
    expect(getEventComments).not.toHaveBeenCalled();
    expect(screen.getByText('Comments (2)')).toBeInTheDocument();
    expect(
      screen.getByText(/Admin view: Showing 1 hidden comment/)
    ).toBeInTheDocument();
  });

  test('shows empty state when no comments', async () => {
    getEventComments.mockResolvedValue([]);
    render(<CommentSection eventId={1} />);
    expect(
      await screen.findByText('No comments yet. Be the first to comment!')
    ).toBeInTheDocument();
  });

  test('shows fetch error and can dismiss it', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventComments.mockRejectedValue(new Error('network'));
    render(<CommentSection eventId={1} />);
    expect(await screen.findByText('Failed to load comments')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Failed to load comments')).not.toBeInTheDocument()
    );
    consoleSpy.mockRestore();
  });

  test('logged-out users see login prompt instead of input', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    expect(screen.getByText('Please log in to leave a comment.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  test('comments disabled shows warning and no input', async () => {
    render(<CommentSection eventId={1} commentsEnabled={false} />);
    await screen.findByText('First comment');
    expect(
      screen.getByText('Comments are disabled for this event.')
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  test('submits a new comment, prepends it, clears input, and reports count', async () => {
    const onCommentCountChange = jest.fn();
    const created = { id: 10, content: 'Great run!', is_hidden: false };
    createComment.mockResolvedValue(created);

    render(<CommentSection eventId={1} onCommentCountChange={onCommentCountChange} />);
    await screen.findByText('First comment');

    const input = screen.getByPlaceholderText('Write a comment...');
    fireEvent.change(input, { target: { value: '  Great run!  ' } });
    fireEvent.click(screen.getByTestId('SendIcon').closest('button'));

    // Wait for the created comment to be rendered as a CommentItem
    // (findByText would match the textarea's own text content).
    await screen.findByTestId('comment-10');
    expect(createComment).toHaveBeenCalledWith(1, 'Great run!', 'user-1');
    expect(input).toHaveValue('');
    expect(screen.getByText('Comments (2)')).toBeInTheDocument();
    expect(onCommentCountChange).toHaveBeenLastCalledWith(2);
  });

  test('submit button disabled for whitespace-only comment', async () => {
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    const input = screen.getByPlaceholderText('Write a comment...');
    const submitBtn = screen.getByTestId('SendIcon').closest('button');
    expect(submitBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submitBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(submitBtn).not.toBeDisabled();
  });

  test('shows error when comment submission fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createComment.mockRejectedValue(new Error('Too many comments'));
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');

    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByTestId('SendIcon').closest('button'));

    expect(await screen.findByText('Too many comments')).toBeInTheDocument();
    // Input keeps its value on failure
    expect(screen.getByPlaceholderText('Write a comment...')).toHaveValue('spam');
    consoleSpy.mockRestore();
  });

  test('submitting the form with empty input is a no-op (guard)', async () => {
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    const form = screen
      .getByPlaceholderText('Write a comment...')
      .closest('form');
    fireEvent.submit(form);
    expect(createComment).not.toHaveBeenCalled();
  });

  test('submit success without onCommentCountChange does not crash', async () => {
    createComment.mockResolvedValue({ id: 11, content: 'Solo', is_hidden: false });
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: { value: 'Solo' },
    });
    fireEvent.click(screen.getByTestId('SendIcon').closest('button'));
    expect(await screen.findByTestId('comment-11')).toBeInTheDocument();
  });

  test('child onDelete without onCommentCountChange does not crash', async () => {
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    fireEvent.click(screen.getByText('delete-1'));
    await waitFor(() =>
      expect(screen.queryByText('First comment')).not.toBeInTheDocument()
    );
  });

  test('submission failure without message uses fallback error text', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createComment.mockRejectedValue({}); // no .message
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: { value: 'oops' },
    });
    fireEvent.click(screen.getByTestId('SendIcon').closest('button'));
    expect(await screen.findByText('Failed to post comment')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('child onUpdate replaces only the matching comment in the list', async () => {
    getEventComments.mockResolvedValue([
      visibleComment,
      { id: 3, content: 'Second comment', is_hidden: false },
    ]);
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    fireEvent.click(screen.getByText('update-1'));
    expect(await screen.findByText('edited content')).toBeInTheDocument();
    expect(screen.queryByText('First comment')).not.toBeInTheDocument();
    expect(screen.getByText('Second comment')).toBeInTheDocument();
  });

  test('child onDelete removes the comment and reports count', async () => {
    const onCommentCountChange = jest.fn();
    render(<CommentSection eventId={1} onCommentCountChange={onCommentCountChange} />);
    await screen.findByText('First comment');
    fireEvent.click(screen.getByText('delete-1'));
    await waitFor(() =>
      expect(screen.queryByText('First comment')).not.toBeInTheDocument()
    );
    expect(onCommentCountChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByText('Comments (0)')).toBeInTheDocument();
  });

  test('child onError surfaces error message', async () => {
    render(<CommentSection eventId={1} />);
    await screen.findByText('First comment');
    fireEvent.click(screen.getByText('error-1'));
    expect(await screen.findByText('probe error')).toBeInTheDocument();
  });
});
