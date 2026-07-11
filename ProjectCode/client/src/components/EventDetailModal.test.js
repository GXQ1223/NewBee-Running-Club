import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import EventDetailModal from './EventDetailModal';
import { getEventEngagement, updateEvent, getEventById } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

jest.mock('../api', () => ({
  getEventEngagement: jest.fn(),
  updateEvent: jest.fn(),
  getEventById: jest.fn(),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('./LikeButton', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'like-button' },
    `like:${props.initialCount}:${String(props.initialLiked)}`,
    React.createElement(
      'button',
      { onClick: () => props.onUpdate({ count: 6, user_liked: true }) },
      'do-like'
    ),
    React.createElement('button', { onClick: () => props.onError('like failed') }, 'like-error')
  );
});

jest.mock('./ReactionPicker', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'reaction-picker' },
    `reactions:${props.reactions.length}`,
    React.createElement(
      'button',
      { onClick: () => props.onUpdate([{ emoji: 'x', count: 1 }, { emoji: 'y', count: 2 }]) },
      'do-react'
    ),
    React.createElement('button', { onClick: () => props.onError('react failed') }, 'react-error')
  );
});

jest.mock('./CommentSection', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'comment-section' },
    `comments:${String(props.commentsEnabled)}`
  );
});

jest.mock('./AdminModerationPanel', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'moderation-panel' },
    React.createElement(
      'button',
      {
        onClick: () =>
          props.onSettingsUpdate({
            comments_enabled: false,
            likes_enabled: false,
            reactions_enabled: false,
          }),
      },
      'disable-all'
    )
  );
});

jest.mock('./EventGalleryPreview', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'gallery-preview' }, `preview:${props.eventId}`);
});

jest.mock('./ImagePositionEditor', () => (props) => {
  const React = require('react');
  return React.createElement(
    'div',
    { 'data-testid': 'position-editor' },
    React.createElement('span', null, props.currentPosition),
    React.createElement('button', { onClick: () => props.onPositionSaved('5% 5%') }, 'saved-pos')
  );
});

const EVENT = {
  id: 1,
  name: 'Spring Race',
  chineseName: '春季赛',
  date: '2026-04-01',
  time: '8:00 AM',
  location: 'Central Park',
  chineseLocation: '中央公园',
  description: 'Register at @https://example.com/signup or visit https://maps.example.com today',
  chineseDescription: '欢迎参加春季赛',
  image: '/img/race.jpg',
  image_position: '10% 20%',
  signupLink: 'https://signup.example.com',
  wechatQrCode: '/img/qr.png',
  status: 'Past',
};

const ENGAGEMENT = {
  likes: { count: 5, user_liked: false },
  reactions: [{ emoji: 'x', count: 1 }],
  likes_enabled: true,
  reactions_enabled: true,
  comments_enabled: true,
};

function renderModal(props = {}) {
  const defaults = { event: EVENT, onClose: jest.fn(), onEventUpdate: jest.fn() };
  const merged = { ...defaults, ...props };
  return { ...render(<EventDetailModal {...merged} />), props: merged };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  getEventEngagement.mockResolvedValue(ENGAGEMENT);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue() },
    configurable: true,
  });
});

describe('EventDetailModal', () => {
  test('renders nothing without an event', () => {
    render(<EventDetailModal event={null} onClose={jest.fn()} />);
    expect(screen.queryByText('Close 关闭')).not.toBeInTheDocument();
  });

  test('renders event details, QR code, signup link and linkified description', async () => {
    renderModal();
    expect(screen.getByText('Spring Race')).toBeInTheDocument();
    expect(screen.getByText('春季赛')).toBeInTheDocument();
    expect(screen.getByText('Date: 2026-04-01')).toBeInTheDocument();
    expect(screen.getByText('Time: 8:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Location: Central Park')).toBeInTheDocument();
    expect(screen.getByText('中央公园')).toBeInTheDocument();
    expect(screen.getByText('欢迎参加春季赛')).toBeInTheDocument();
    expect(screen.getByAltText('WeChat QR Code')).toHaveAttribute('src', '/img/qr.png');

    const signup = screen.getByRole('link', { name: /Sign Up/ });
    expect(signup).toHaveAttribute('href', 'https://signup.example.com');

    // "@https://" links strip the leading @ from href but keep it in the text
    const atLink = screen.getByRole('link', { name: '@https://example.com/signup' });
    expect(atLink).toHaveAttribute('href', 'https://example.com/signup');
    const plainLink = screen.getByRole('link', { name: 'https://maps.example.com' });
    expect(plainLink).toHaveAttribute('href', 'https://maps.example.com');

    // event image with configured position
    const img = screen.getByAltText('Spring Race');
    expect(img).toHaveAttribute('src', '/img/race.jpg');
    await waitFor(() => expect(img).toHaveStyle({ objectPosition: '10% 20%' }));
  });

  test('falls back to title/chineseTitle naming and hides optional sections', async () => {
    const minimal = { id: 2, title: 'Alt Title', chineseTitle: '备用', date: '2026-05-01', image: '/i.jpg' };
    renderModal({ event: minimal });
    expect(screen.getByText('Alt Title')).toBeInTheDocument();
    expect(screen.getByText('备用')).toBeInTheDocument();
    expect(screen.queryByText(/^Time:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Location:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sign Up/ })).not.toBeInTheDocument();
    expect(screen.queryByAltText('WeChat QR Code')).not.toBeInTheDocument();
    await waitFor(() => expect(getEventEngagement).toHaveBeenCalled());
  });

  test('loads engagement and renders like, reactions, gallery and comments', async () => {
    renderModal();
    expect(await screen.findByTestId('like-button')).toHaveTextContent('like:5:false');
    expect(screen.getByTestId('reaction-picker')).toHaveTextContent('reactions:1');
    expect(screen.getByTestId('comment-section')).toHaveTextContent('comments:true');
    expect(screen.getByText('Photos / 相册')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-preview')).toHaveTextContent('preview:1');
    expect(getEventEngagement).toHaveBeenCalledWith(1, 'user-1');
  });

  test('hides like and reactions when disabled by settings', async () => {
    getEventEngagement.mockResolvedValue({
      ...ENGAGEMENT,
      likes_enabled: false,
      reactions_enabled: false,
    });
    renderModal();
    await screen.findByTestId('comment-section');
    expect(screen.queryByTestId('like-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reaction-picker')).not.toBeInTheDocument();
  });

  test('hides the gallery section for upcoming events', async () => {
    renderModal({ event: { ...EVENT, status: 'Upcoming' } });
    await screen.findByTestId('comment-section');
    expect(screen.queryByText('Photos / 相册')).not.toBeInTheDocument();
  });

  test('engagement fetch failure shows error snackbar and no engagement UI', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventEngagement.mockRejectedValue(new Error('down'));
    renderModal();
    expect(
      await screen.findByText('Failed to load engagement / 加载互动失败')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('comment-section')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('like updates refresh the engagement state; like errors surface a snackbar', async () => {
    renderModal();
    await screen.findByTestId('like-button');
    fireEvent.click(screen.getByText('do-like'));
    expect(screen.getByTestId('like-button')).toHaveTextContent('like:6:true');

    fireEvent.click(screen.getByText('like-error'));
    expect(await screen.findByText('like failed')).toBeInTheDocument();
  });

  test('reaction updates refresh state; reaction errors surface a snackbar', async () => {
    renderModal();
    await screen.findByTestId('reaction-picker');
    fireEvent.click(screen.getByText('do-react'));
    expect(screen.getByTestId('reaction-picker')).toHaveTextContent('reactions:2');

    fireEvent.click(screen.getByText('react-error'));
    expect(await screen.findByText('react failed')).toBeInTheDocument();
  });

  test('share copies the calendar deep link and confirms via snackbar', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('ShareIcon').closest('button'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/calendar?event=1`
    );
    expect(await screen.findByText('Link copied / 链接已复制')).toBeInTheDocument();

    // dismiss the snackbar
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Link copied / 链接已复制')).not.toBeInTheDocument()
    );
  });

  test('error snackbar can be dismissed', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventEngagement.mockRejectedValue(new Error('down'));
    renderModal();
    expect(
      await screen.findByText('Failed to load engagement / 加载互动失败')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(
        screen.queryByText('Failed to load engagement / 加载互动失败')
      ).not.toBeInTheDocument()
    );
    consoleSpy.mockRestore();
  });

  test('image error swaps in the fallback image', async () => {
    renderModal();
    const img = screen.getByAltText('Spring Race');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', '/images/2025/20250517_bk_half.jpg');
    consoleSpy.mockRestore();
    await waitFor(() => expect(getEventEngagement).toHaveBeenCalled());
  });

  test('View All gallery button closes modal and navigates', async () => {
    const { props } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'View All' }));
    expect(props.onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/events/1/gallery');
  });

  test('backdrop click closes; clicks inside the card do not', async () => {
    const { props } = renderModal();
    await screen.findByTestId('comment-section');
    fireEvent.click(screen.getByText('Spring Race'));
    expect(props.onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByText('Spring Race').closest('.MuiCard-root').parentElement;
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalled();
  });

  test('Close button closes the modal', async () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close 关闭' }));
    expect(props.onClose).toHaveBeenCalled();
    await waitFor(() => expect(getEventEngagement).toHaveBeenCalled());
  });

  describe('admin mode', () => {
    beforeEach(() => {
      useAdmin.mockReturnValue({ adminModeEnabled: true });
      getEventById.mockResolvedValue({
        id: 1,
        name: 'Server Name',
        chinese_name: '服务器名',
        date: '2026-04-02',
        time: '9:00 AM',
        location: 'Server Loc',
        chinese_location: '服务器地点',
        description: 'Server desc',
        chinese_description: '服务器描述',
        image: '/img/server.jpg',
        signup_link: 'https://server.example.com',
        wechat_qr_code: '/img/server-qr.png',
        status: 'Highlight',
        is_highlight: false,
        event_type: 'race',
      });
    });

    test('renders position editor and moderation panel; position saves propagate', async () => {
      const { props } = renderModal();
      expect(screen.getByTestId('position-editor')).toBeInTheDocument();
      expect(await screen.findByTestId('moderation-panel')).toBeInTheDocument();

      fireEvent.click(screen.getByText('saved-pos'));
      expect(props.onEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, image_position: '5% 5%' })
      );
    });

    test('moderation settings update flows into the comment section', async () => {
      renderModal();
      await screen.findByTestId('moderation-panel');
      fireEvent.click(screen.getByText('disable-all'));
      expect(screen.getByTestId('comment-section')).toHaveTextContent('comments:false');
      expect(screen.queryByTestId('like-button')).not.toBeInTheDocument();
    });

    test('edit opens with fresh server data; legacy Highlight status maps to Past + flag', async () => {
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));

      await waitFor(() => expect(getEventById).toHaveBeenCalledWith(1));
      expect(await screen.findByLabelText(/Event Name/)).toHaveValue('Server Name');
      expect(screen.getByLabelText(/Chinese Name/)).toHaveValue('服务器名');
      expect(screen.getByLabelText(/Date \/ 日期/)).toHaveValue('2026-04-02');
      expect(screen.getByLabelText(/Time \/ 时间/)).toHaveValue('9:00 AM');
      expect(screen.getByLabelText(/Image URL/)).toHaveValue('/img/server.jpg');
      expect(screen.getByLabelText(/Signup Link/)).toHaveValue('https://server.example.com');
      expect(screen.getByText('Past / 已结束')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeChecked(); // highlight switch
    });

    test('falls back to the prop event when the fresh fetch fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      getEventById.mockRejectedValue(new Error('404'));
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      expect(await screen.findByLabelText(/Event Name/)).toHaveValue('Spring Race');
      expect(screen.getByLabelText(/Chinese Name/)).toHaveValue('春季赛');
      consoleSpy.mockRestore();
    });

    test('validates required name and date before saving', async () => {
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      const nameField = await screen.findByLabelText(/Event Name/);

      fireEvent.change(nameField, { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
      expect(await screen.findByText('Name cannot be empty / 名称不能为空')).toBeInTheDocument();
      expect(updateEvent).not.toHaveBeenCalled();

      fireEvent.change(nameField, { target: { value: 'Valid' } });
      fireEvent.change(screen.getByLabelText(/Date \/ 日期/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
      expect(await screen.findByText('Date is required / 日期为必填项')).toBeInTheDocument();
      expect(updateEvent).not.toHaveBeenCalled();
    });

    test('saves trimmed values, nulls empty strings, and mirrors camelCase to parent', async () => {
      updateEvent.mockResolvedValue({
        id: 1,
        name: 'New Name',
        chinese_name: '新名字',
        chinese_location: null,
        chinese_description: '服务器描述',
        signup_link: null,
        wechat_qr_code: '/img/server-qr.png',
        status: 'Past',
        is_highlight: true,
      });
      const { props } = renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      const nameField = await screen.findByLabelText(/Event Name/);

      fireEvent.change(nameField, { target: { value: '  New Name  ' } });
      fireEvent.change(screen.getByLabelText(/Chinese Location/), { target: { value: '   ' } });
      fireEvent.change(screen.getByLabelText(/Signup Link/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));

      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            name: 'New Name',
            chinese_name: '服务器名',
            date: '2026-04-02',
            time: '9:00 AM',
            location: 'Server Loc',
            chinese_location: null,
            signup_link: null,
            wechat_qr_code: '/img/server-qr.png',
            status: 'Past',
            is_highlight: true,
            event_type: 'race',
          }),
          'user-1'
        )
      );
      await waitFor(() =>
        expect(props.onEventUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Name',
            chineseName: '新名字',
            chineseLocation: null,
            chineseDescription: '服务器描述',
            signupLink: null,
            wechatQrCode: '/img/server-qr.png',
          })
        )
      );
      // edit mode exits
      await waitFor(() =>
        expect(screen.queryByLabelText(/Event Name/)).not.toBeInTheDocument()
      );
    });

    test('status and type dropdowns open above the overlay and change values', async () => {
      updateEvent.mockResolvedValue({ id: 1, name: 'Server Name', status: 'Cancelled' });
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      await screen.findByLabelText(/Event Name/);

      // The modal overlay uses zIndex 9999 — menus must portal above it or
      // they open invisibly behind the backdrop (regression: uneditable selects)
      fireEvent.mouseDown(screen.getByLabelText(/Status \/ 状态/));
      let listbox = await screen.findByRole('listbox');
      expect(Number(getComputedStyle(listbox.closest('.MuiModal-root')).zIndex)).toBeGreaterThan(9999);
      fireEvent.click(within(listbox).getByText('Cancelled / 已取消'));
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

      fireEvent.mouseDown(screen.getByLabelText(/Type \/ 类型/));
      listbox = await screen.findByRole('listbox');
      expect(Number(getComputedStyle(listbox.closest('.MuiModal-root')).zIndex)).toBeGreaterThan(9999);
      fireEvent.click(within(listbox).getByText('Standard'));
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ status: 'Cancelled', event_type: 'standard' }),
          'user-1'
        )
      );
    });

    test('toggling the highlight switch updates the form value sent on save', async () => {
      updateEvent.mockResolvedValue({ id: 1, name: 'Server Name', status: 'Past' });
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      const highlightSwitch = await screen.findByRole('checkbox');
      expect(highlightSwitch).toBeChecked();
      fireEvent.click(highlightSwitch);
      expect(highlightSwitch).not.toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ is_highlight: false }),
          'user-1'
        )
      );
    });

    test('save failure keeps the form open and shows an error snackbar', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      updateEvent.mockRejectedValue(new Error('500'));
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      await screen.findByLabelText(/Event Name/);
      fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
      expect(await screen.findByText('Failed to save event / 保存活动失败')).toBeInTheDocument();
      expect(screen.getByLabelText(/Event Name/)).toBeInTheDocument();
      consoleSpy.mockRestore();
    });

    test('cancel exits edit mode without saving', async () => {
      renderModal();
      fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
      await screen.findByLabelText(/Event Name/);
      fireEvent.click(screen.getByRole('button', { name: /Cancel \/ 取消/ }));
      expect(screen.queryByLabelText(/Event Name/)).not.toBeInTheDocument();
      expect(screen.getByText('Spring Race')).toBeInTheDocument();
      expect(updateEvent).not.toHaveBeenCalled();
    });
  });
});
