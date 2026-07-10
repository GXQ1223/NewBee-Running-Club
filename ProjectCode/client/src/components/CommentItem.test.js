import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommentItem from './CommentItem';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import {
  deleteComment,
  toggleCommentHighlight,
  hideComment,
  unhideComment,
} from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));
jest.mock('../api', () => ({
  deleteComment: jest.fn(),
  toggleCommentHighlight: jest.fn(),
  hideComment: jest.fn(),
  unhideComment: jest.fn(),
}));

const baseComment = {
  id: 42,
  firebase_uid: 'author-uid',
  author_name: 'Runner Bee',
  author_photo_url: null,
  content: 'What a great race!',
  created_at: new Date(Date.now() - 60 * 1000).toISOString(),
  is_highlighted: false,
  is_hidden: false,
  hidden_reason: null,
};

const openMenu = () => {
  fireEvent.click(screen.getByTestId('MoreVertIcon').closest('button'));
};

describe('CommentItem', () => {
  let confirmSpy;
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { uid: 'author-uid' } });
    useAdmin.mockReturnValue({ adminModeEnabled: false });
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  test('renders author, content, avatar initial, and relative time', () => {
    render(<CommentItem comment={baseComment} />);
    expect(screen.getByText('Runner Bee')).toBeInTheDocument();
    expect(screen.getByText('What a great race!')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument(); // avatar fallback initial
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  test('renders without relative time when created_at missing', () => {
    render(<CommentItem comment={{ ...baseComment, created_at: null }} />);
    expect(screen.getByText('Runner Bee')).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  test('no menu button for other users when not admin', () => {
    useAuth.mockReturnValue({ currentUser: { uid: 'someone-else' } });
    render(<CommentItem comment={baseComment} />);
    expect(screen.queryByTestId('MoreVertIcon')).not.toBeInTheDocument();
  });

  test('own comment shows only Delete in menu (no moderation)', () => {
    render(<CommentItem comment={baseComment} />);
    openMenu();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.queryByText('Highlight')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide Comment')).not.toBeInTheDocument();
  });

  test('delete confirmed calls API and onDelete', async () => {
    deleteComment.mockResolvedValue({});
    const onDelete = jest.fn();
    render(<CommentItem comment={baseComment} onDelete={onDelete} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this comment?'
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(42));
    expect(deleteComment).toHaveBeenCalledWith(42, 'author-uid');
  });

  test('delete cancelled via confirm does not call API', () => {
    confirmSpy.mockReturnValue(false);
    render(<CommentItem comment={baseComment} onDelete={jest.fn()} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    expect(deleteComment).not.toHaveBeenCalled();
  });

  test('delete failure surfaces onError', async () => {
    deleteComment.mockRejectedValue(new Error('nope'));
    const onError = jest.fn();
    render(<CommentItem comment={baseComment} onError={onError} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to delete comment / 删除评论失败')
    );
  });

  test('admin sees moderation menu items and can toggle highlight', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    toggleCommentHighlight.mockResolvedValue({ is_highlighted: true });
    const onUpdate = jest.fn();
    render(<CommentItem comment={baseComment} onUpdate={onUpdate} />);
    openMenu();
    fireEvent.click(screen.getByText('Highlight'));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({ ...baseComment, is_highlighted: true })
    );
    expect(toggleCommentHighlight).toHaveBeenCalledWith(42, 'author-uid');
  });

  test('highlight failure surfaces onError', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    toggleCommentHighlight.mockRejectedValue(new Error('nope'));
    const onError = jest.fn();
    render(<CommentItem comment={baseComment} onError={onError} />);
    openMenu();
    fireEvent.click(screen.getByText('Highlight'));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to toggle highlight / 切换高亮失败')
    );
  });

  test('highlighted comment shows chip and Remove Highlight menu label', () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    render(<CommentItem comment={{ ...baseComment, is_highlighted: true }} />);
    expect(screen.getByText('Highlighted')).toBeInTheDocument();
    openMenu();
    expect(screen.getByText('Remove Highlight')).toBeInTheDocument();
  });

  test('hide flow: dialog requires reason, confirms via API, and updates', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    hideComment.mockResolvedValue({});
    const onUpdate = jest.fn();
    render(<CommentItem comment={baseComment} onUpdate={onUpdate} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));

    expect(
      await screen.findByText(/Please provide a reason for hiding this comment/)
    ).toBeInTheDocument();
    const hideBtn = screen.getByRole('button', { name: 'Hide' });
    expect(hideBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'spam' },
    });
    expect(hideBtn).not.toBeDisabled();
    fireEvent.click(hideBtn);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        ...baseComment,
        is_hidden: true,
        hidden_reason: 'spam',
      })
    );
    expect(hideComment).toHaveBeenCalledWith(42, 'spam', 'author-uid');
    await waitFor(() =>
      expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
    );
  });

  test('hide dialog can be cancelled', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
    );
    expect(hideComment).not.toHaveBeenCalled();
  });

  test('hide failure surfaces onError and keeps dialog open', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    hideComment.mockRejectedValue(new Error('nope'));
    const onError = jest.fn();
    render(<CommentItem comment={baseComment} onError={onError} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to hide comment / 隐藏评论失败')
    );
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });

  test('hidden comment shows chip, reason, and Unhide flow for admin', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    unhideComment.mockResolvedValue({});
    const onUpdate = jest.fn();
    const hidden = { ...baseComment, is_hidden: true, hidden_reason: 'off-topic' };
    render(<CommentItem comment={hidden} onUpdate={onUpdate} />);

    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('Reason: off-topic')).toBeInTheDocument();

    openMenu();
    expect(screen.queryByText('Hide Comment')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Unhide Comment'));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        ...hidden,
        is_hidden: false,
        hidden_reason: null,
      })
    );
    expect(unhideComment).toHaveBeenCalledWith(42, 'author-uid');
  });

  test('unhide failure surfaces onError', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    unhideComment.mockRejectedValue(new Error('nope'));
    const onError = jest.fn();
    render(
      <CommentItem
        comment={{ ...baseComment, is_hidden: true }}
        onError={onError}
      />
    );
    openMenu();
    fireEvent.click(screen.getByText('Unhide Comment'));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Failed to unhide comment / 取消隐藏失败')
    );
  });

  test('hidden chip and reason are not shown to non-admins', () => {
    useAuth.mockReturnValue({ currentUser: { uid: 'someone-else' } });
    render(
      <CommentItem
        comment={{ ...baseComment, is_hidden: true, hidden_reason: 'off-topic' }}
      />
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  test('hide dialog closes via escape (Dialog onClose)', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));
    const reason = await screen.findByLabelText('Reason');
    fireEvent.keyDown(reason, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument()
    );
  });

  test('success handlers tolerate missing callbacks', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    deleteComment.mockResolvedValue({});
    toggleCommentHighlight.mockResolvedValue({ is_highlighted: true });
    unhideComment.mockResolvedValue({});
    hideComment.mockResolvedValue({});

    // Highlight without onUpdate
    const { unmount } = render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Highlight'));
    await waitFor(() => expect(toggleCommentHighlight).toHaveBeenCalled());
    unmount();

    // Unhide without onUpdate
    const hidden = { ...baseComment, is_hidden: true };
    const second = render(<CommentItem comment={hidden} />);
    openMenu();
    fireEvent.click(screen.getByText('Unhide Comment'));
    await waitFor(() => expect(unhideComment).toHaveBeenCalled());
    second.unmount();

    // Hide without onUpdate
    const third = render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));
    fireEvent.change(await screen.findByLabelText('Reason'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hideComment).toHaveBeenCalled());
    third.unmount();

    // Delete without onDelete
    render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(deleteComment).toHaveBeenCalled());
  });

  test('failure handlers tolerate missing onError', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    deleteComment.mockRejectedValue(new Error('x'));
    toggleCommentHighlight.mockRejectedValue(new Error('x'));
    unhideComment.mockRejectedValue(new Error('x'));
    hideComment.mockRejectedValue(new Error('x'));

    const { unmount } = render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Highlight'));
    await waitFor(() => expect(toggleCommentHighlight).toHaveBeenCalled());
    unmount();

    const second = render(<CommentItem comment={{ ...baseComment, is_hidden: true }} />);
    openMenu();
    fireEvent.click(screen.getByText('Unhide Comment'));
    await waitFor(() => expect(unhideComment).toHaveBeenCalled());
    second.unmount();

    const third = render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Hide Comment'));
    fireEvent.change(await screen.findByLabelText('Reason'), {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hideComment).toHaveBeenCalled());
    third.unmount();

    render(<CommentItem comment={baseComment} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(deleteComment).toHaveBeenCalled());
  });

  test('avatar renders without initial when author_name missing', () => {
    render(<CommentItem comment={{ ...baseComment, author_name: null }} />);
    expect(screen.getByText('What a great race!')).toBeInTheDocument();
  });

  test('member_id fallback marks comment as own', () => {
    useAuth.mockReturnValue({ currentUser: { uid: 'member-9' } });
    render(
      <CommentItem
        comment={{ ...baseComment, firebase_uid: 'other', member_id: 'member-9' }}
      />
    );
    expect(screen.getByTestId('MoreVertIcon')).toBeInTheDocument();
  });
});
