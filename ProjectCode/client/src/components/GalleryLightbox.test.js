import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GalleryLightbox from './GalleryLightbox';
import {
  toggleGalleryImageLike,
  downloadImage,
  shareImage,
  updateGalleryImage,
} from '../api/gallery';
import { updateEvent } from '../api/events';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

jest.mock('../api/gallery', () => ({
  toggleGalleryImageLike: jest.fn(),
  downloadImage: jest.fn(),
  shareImage: jest.fn(),
  updateGalleryImage: jest.fn(),
}));
jest.mock('../api/events', () => ({ updateEvent: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Factory: the component mutates image objects when editing the uploader
// name, so each test needs a fresh copy.
const makeImages = () => [
  {
    id: 1,
    event_id: 42,
    image_url: '/img/1.jpg',
    caption: 'First photo',
    caption_cn: '第一张',
    like_count: 3,
    user_liked: false,
    uploaded_by_name: 'Alice',
  },
  {
    id: 2,
    event_id: 42,
    image_url: '/img/2.jpg',
    like_count: 0,
    user_liked: true,
  },
];
let IMAGES;

function renderLightbox(props = {}) {
  const defaults = {
    open: true,
    onClose: jest.fn(),
    images: IMAGES,
    initialIndex: 0,
  };
  const merged = { ...defaults, ...props };
  return {
    ...render(
      <MemoryRouter>
        <GalleryLightbox {...merged} />
      </MemoryRouter>
    ),
    props: merged,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  IMAGES = makeImages();
  useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  useAdmin.mockReturnValue({ adminModeEnabled: false });
});

describe('GalleryLightbox', () => {
  test('renders nothing when there is no current image', () => {
    renderLightbox({ images: [] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders counter, image, captions and uploader', () => {
    renderLightbox();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByAltText('First photo')).toHaveAttribute('src', '/img/1.jpg');
    expect(screen.getByText('First photo')).toBeInTheDocument();
    expect(screen.getByText('第一张')).toBeInTheDocument();
    expect(screen.getByText('Uploaded by Alice')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // like count
  });

  test('next and previous buttons cycle with wrap-around', () => {
    renderLightbox();
    fireEvent.click(screen.getByTestId('NavigateNextIcon').closest('button'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    // wrap forward to first
    fireEvent.click(screen.getByTestId('NavigateNextIcon').closest('button'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    // wrap backwards to last
    fireEvent.click(screen.getByTestId('NavigateBeforeIcon').closest('button'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  test('hides nav buttons for a single image', () => {
    renderLightbox({ images: [IMAGES[0]] });
    expect(screen.queryByTestId('NavigateNextIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('NavigateBeforeIcon')).not.toBeInTheDocument();
  });

  test('keyboard navigation: arrows navigate, Escape closes', () => {
    const { props } = renderLightbox();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'x' }); // ignored key
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  test('keyboard is inert when closed', () => {
    const { props } = renderLightbox({ open: false });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test('resets to initialIndex when it changes', () => {
    const { rerender } = renderLightbox();
    fireEvent.click(screen.getByTestId('NavigateNextIcon').closest('button'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <GalleryLightbox open onClose={jest.fn()} images={IMAGES} initialIndex={0} />
      </MemoryRouter>
    );
    // same initialIndex; navigate away then change index
    rerender(
      <MemoryRouter>
        <GalleryLightbox open onClose={jest.fn()} images={IMAGES} initialIndex={1} />
      </MemoryRouter>
    );
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  test('close button calls onClose', () => {
    const { props } = renderLightbox();
    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    expect(props.onClose).toHaveBeenCalled();
  });

  describe('like', () => {
    test('successful like notifies parent with new counts', async () => {
      toggleGalleryImageLike.mockResolvedValue({ like_count: 4, user_liked: true });
      const onImageUpdate = jest.fn();
      renderLightbox({ onImageUpdate });
      fireEvent.click(screen.getByTestId('FavoriteBorderIcon').closest('button'));
      await waitFor(() =>
        expect(onImageUpdate).toHaveBeenCalledWith(1, { like_count: 4, user_liked: true })
      );
      expect(toggleGalleryImageLike).toHaveBeenCalledWith(1, 'user-1');
    });

    test('like works without onImageUpdate', async () => {
      toggleGalleryImageLike.mockResolvedValue({ like_count: 4, user_liked: true });
      renderLightbox();
      fireEvent.click(screen.getByTestId('FavoriteBorderIcon').closest('button'));
      await waitFor(() => expect(toggleGalleryImageLike).toHaveBeenCalled());
    });

    test('shows filled heart for already-liked image', () => {
      renderLightbox({ initialIndex: 1 });
      expect(screen.getByTestId('FavoriteIcon')).toBeInTheDocument();
    });

    test('failed like shows error snackbar', async () => {
      toggleGalleryImageLike.mockRejectedValue(new Error('nope'));
      renderLightbox();
      fireEvent.click(screen.getByTestId('FavoriteBorderIcon').closest('button'));
      expect(await screen.findByText('Failed to update like')).toBeInTheDocument();
    });
  });

  describe('download', () => {
    test('logged-in user triggers download and snackbar', async () => {
      renderLightbox();
      fireEvent.click(screen.getByTestId('DownloadIcon').closest('button'));
      expect(downloadImage).toHaveBeenCalledWith('/img/1.jpg', 'gallery-1.jpg');
      expect(await screen.findByText('Download started / 开始下载')).toBeInTheDocument();
    });

    test('anonymous user sees sign-in prompt that closes and navigates to register', () => {
      useAuth.mockReturnValue({ currentUser: null });
      const { props } = renderLightbox();
      expect(screen.getByText('Sign in to download')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('DownloadIcon').closest('button'));
      expect(downloadImage).not.toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/register');
    });
  });

  describe('share', () => {
    test('successful share shows copied snackbar with gallery url', async () => {
      shareImage.mockResolvedValue(true);
      renderLightbox();
      fireEvent.click(screen.getByTestId('ShareIcon').closest('button'));
      await waitFor(() =>
        expect(shareImage).toHaveBeenCalledWith(
          `${window.location.origin}/events/42/gallery?image=1`,
          'Check out this photo from NewBee Running Club!'
        )
      );
      expect(await screen.findByText('Copied to clipboard / 已复制到剪贴板')).toBeInTheDocument();
    });

    test('failed share shows error snackbar and it can be dismissed', async () => {
      shareImage.mockResolvedValue(false);
      renderLightbox();
      fireEvent.click(screen.getByTestId('ShareIcon').closest('button'));
      expect(await screen.findByText('Failed to share')).toBeInTheDocument();
      fireEvent.click(screen.getByTitle('Close'));
      await waitFor(() =>
        expect(screen.queryByText('Failed to share')).not.toBeInTheDocument()
      );
    });
  });

  describe('set cover (admin)', () => {
    beforeEach(() => {
      useAdmin.mockReturnValue({ adminModeEnabled: true });
    });

    test('button hidden without eventId', () => {
      renderLightbox();
      expect(screen.queryByText('Set Cover')).not.toBeInTheDocument();
    });

    test('updates event cover image on success', async () => {
      updateEvent.mockResolvedValue({});
      renderLightbox({ eventId: 42 });
      fireEvent.click(screen.getByTestId('WallpaperIcon').closest('button'));
      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith(42, { image: '/img/1.jpg' }, 'user-1')
      );
      expect(await screen.findByText('Cover image updated / 封面已更新')).toBeInTheDocument();
    });

    test('shows error snackbar on failure', async () => {
      updateEvent.mockRejectedValue(new Error('denied'));
      renderLightbox({ eventId: 42 });
      fireEvent.click(screen.getByTestId('WallpaperIcon').closest('button'));
      expect(await screen.findByText('Failed to set cover image / 设置封面失败')).toBeInTheDocument();
    });
  });

  describe('report / request delete', () => {
    test('report closes lightbox and requests deletion', () => {
      const onRequestDelete = jest.fn();
      const { props } = renderLightbox({ onRequestDelete });
      expect(screen.getByText('Report')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('FlagIcon').closest('button'));
      expect(props.onClose).toHaveBeenCalled();
      expect(onRequestDelete).toHaveBeenCalledWith(IMAGES[0]);
    });

    test('already-requested image disables the report button', () => {
      const requested = [{ ...IMAGES[0], user_requested_deletion: true }];
      renderLightbox({ images: requested, onRequestDelete: jest.fn() });
      expect(screen.getByText('Requested')).toBeInTheDocument();
      expect(screen.getByTestId('FlagIcon').closest('button')).toBeDisabled();
    });

    test('report button hidden in admin mode or without handler', () => {
      renderLightbox();
      expect(screen.queryByText('Report')).not.toBeInTheDocument();
      useAdmin.mockReturnValue({ adminModeEnabled: true });
      renderLightbox({ onRequestDelete: jest.fn() });
      expect(screen.queryByText('Report')).not.toBeInTheDocument();
    });
  });

  describe('uploader name editing (admin)', () => {
    beforeEach(() => {
      useAdmin.mockReturnValue({ adminModeEnabled: true });
    });

    test('non-admin cannot enter edit mode', () => {
      useAdmin.mockReturnValue({ adminModeEnabled: false });
      renderLightbox();
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('admin edits the name and saves with Enter', async () => {
      updateGalleryImage.mockResolvedValue({});
      const onImageUpdate = jest.fn();
      renderLightbox({ onImageUpdate });
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('Alice');
      fireEvent.change(input, { target: { value: 'Bob' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() =>
        expect(updateGalleryImage).toHaveBeenCalledWith(1, { uploaded_by_name: 'Bob' }, 'user-1')
      );
      await waitFor(() =>
        expect(onImageUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ id: 1, uploaded_by_name: 'Bob' })
        )
      );
      await waitFor(() => expect(screen.getByText('Uploaded by Bob')).toBeInTheDocument());
    });

    test('Enter save failure logs and exits edit mode', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      updateGalleryImage.mockRejectedValue(new Error('bad'));
      renderLightbox();
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('Escape cancels editing without saving', () => {
      renderLightbox();
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(updateGalleryImage).not.toHaveBeenCalled();
      expect(screen.getByText('Uploaded by Alice')).toBeInTheDocument();
    });

    test('blur saves the name', async () => {
      updateGalleryImage.mockResolvedValue({});
      renderLightbox();
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Carol' } });
      fireEvent.blur(input);
      await waitFor(() =>
        expect(updateGalleryImage).toHaveBeenCalledWith(1, { uploaded_by_name: 'Carol' }, 'user-1')
      );
      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    });

    test('blur save failure logs and exits edit mode', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      updateGalleryImage.mockRejectedValue(new Error('bad'));
      renderLightbox();
      fireEvent.click(screen.getByText('Uploaded by Alice'));
      fireEvent.blur(screen.getByRole('textbox'));
      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
