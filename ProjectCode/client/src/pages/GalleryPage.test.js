import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GalleryPage from './GalleryPage';
import {
  getEventGallery,
  toggleGalleryImageLike,
  deleteGalleryImage,
  requestGalleryImageDeletion,
  resolveGalleryDeletionRequest,
} from '../api/gallery';
import { getEventById } from '../api/events';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

jest.mock('../api/gallery', () => ({
  getEventGallery: jest.fn(),
  toggleGalleryImageLike: jest.fn(),
  deleteGalleryImage: jest.fn(),
  requestGalleryImageDeletion: jest.fn(),
  resolveGalleryDeletionRequest: jest.fn(),
}));
jest.mock('../api/events', () => ({ getEventById: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));

jest.mock('../components/GalleryLightbox', () => {
  const React = require('react');
  return function MockLightbox({ open, onClose, images, initialIndex, onImageUpdate, onRequestDelete }) {
    if (!open) return null;
    return React.createElement(
      'div',
      { 'data-testid': 'lightbox' },
      React.createElement('span', { 'data-testid': 'lightbox-index' }, String(initialIndex)),
      React.createElement(
        'button',
        { onClick: () => onImageUpdate(images[0].id, { like_count: 99 }) },
        'lb-update'
      ),
      React.createElement(
        'button',
        { onClick: () => onRequestDelete(images[0]) },
        'lb-request'
      ),
      React.createElement('button', { onClick: onClose }, 'lb-close')
    );
  };
});

jest.mock('../components/GalleryUploadButton', () => {
  const React = require('react');
  return function MockUploadButton({ onUploadSuccess, variant }) {
    return React.createElement(
      'button',
      {
        onClick: () =>
          onUploadSuccess({ id: 999, image_url: 'new.jpg', like_count: 0, uploaded_by_name: 'Newbie' }),
      },
      `upload-${variant}`
    );
  };
});

const event = { id: 1, name: 'Spring Run', chinese_name: '春季跑', date: '2025-04-01' };

const makeImages = () => [
  {
    id: 1,
    image_url: 'a.jpg',
    caption: 'Photo A',
    like_count: 2,
    user_liked: false,
    uploaded_by_id: 7,
    uploaded_by_name: 'Alice',
  },
  {
    id: 2,
    image_url: 'b.jpg',
    caption: null,
    like_count: 0,
    user_liked: true,
    uploaded_by_id: 8,
    uploaded_by_name: 'Bob',
    has_pending_deletion_request: true,
    deletion_request: { id: 55, requested_by_name: 'Carl', reason: 'Blurry photo' },
  },
];

const setAuth = ({ user = null, adminModeEnabled = false, memberData = null } = {}) => {
  useAuth.mockReturnValue({ currentUser: user });
  useAdmin.mockReturnValue({ adminModeEnabled, memberData });
};

const renderGallery = (entry = '/events/1/gallery') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/events/:eventId/gallery" element={<GalleryPage />} />
      </Routes>
    </MemoryRouter>
  );

const settle = async () => {
  await screen.findByText('Event Gallery');
};

beforeEach(() => {
  jest.clearAllMocks();
  getEventById.mockResolvedValue(event);
  getEventGallery.mockResolvedValue(makeImages());
  setAuth();
});

test('renders photos, event header, and no upload button for anonymous users', async () => {
  renderGallery();
  await settle();

  expect(screen.getAllByText('Spring Run').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('春季跑')).toBeInTheDocument();
  expect(screen.getByText('2 photos')).toBeInTheDocument();
  expect(screen.getByAltText('Photo A')).toBeInTheDocument();
  expect(screen.getByAltText('Gallery image')).toBeInTheDocument(); // caption-less fallback
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument(); // like count badge

  // No upload for anonymous, no delete/flag buttons
  expect(screen.queryByText(/^upload-/)).not.toBeInTheDocument();
  expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  expect(screen.queryByTestId('FlagIcon')).not.toBeInTheDocument();
});

test('logged-in user sees upload buttons and new upload prepends to grid', async () => {
  setAuth({ user: { uid: 'u1' }, memberData: { id: 7 } });
  renderGallery();
  await settle();

  fireEvent.click(screen.getByText('upload-button'));
  expect(screen.getByText('3 photos')).toBeInTheDocument();
  expect(screen.getByText('Newbie')).toBeInTheDocument();
  expect(screen.getByText('upload-fab')).toBeInTheDocument();
});

test('like toggles via API and updates count', async () => {
  setAuth({ user: { uid: 'u1' }, memberData: { id: 7 } });
  toggleGalleryImageLike.mockResolvedValue({ like_count: 3, user_liked: true });
  renderGallery();
  await settle();

  const likeButton = screen.getByTestId('FavoriteBorderIcon').closest('button');
  fireEvent.click(likeButton);

  await waitFor(() => expect(toggleGalleryImageLike).toHaveBeenCalledWith(1, 'u1'));
  expect(await screen.findByText('3')).toBeInTheDocument();
  // Icon flips to the filled heart
  expect(screen.queryByTestId('FavoriteBorderIcon')).not.toBeInTheDocument();
});

test('like failure shows error snackbar which can be dismissed', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  toggleGalleryImageLike.mockRejectedValue(new Error('nope'));
  renderGallery();
  await settle();

  fireEvent.click(screen.getByTestId('FavoriteBorderIcon').closest('button'));
  expect(await screen.findByText(/Failed to like image/)).toBeInTheDocument();

  fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
  await waitFor(() =>
    expect(screen.queryByText(/Failed to like image/)).not.toBeInTheDocument()
  );
  errSpy.mockRestore();
});

test('clicking a photo opens the lightbox; lightbox can update images and request deletion', async () => {
  setAuth({ user: { uid: 'u1' }, memberData: { id: 99 } });
  renderGallery();
  await settle();

  fireEvent.click(screen.getByAltText('Photo A'));
  expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  expect(screen.getByTestId('lightbox-index')).toHaveTextContent('0');

  // onImageUpdate flows back into the grid
  fireEvent.click(screen.getByText('lb-update'));
  expect(screen.getByText('99')).toBeInTheDocument();

  // onRequestDelete opens the request-deletion dialog
  fireEvent.click(screen.getByText('lb-request'));
  expect(screen.getByText('Request Image Deletion / 申请删除图片')).toBeInTheDocument();

  fireEvent.click(screen.getByText('lb-close'));
  await waitFor(() => expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument());
});

test('deep link with ?image= opens lightbox at that image', async () => {
  renderGallery('/events/1/gallery?image=2');
  await settle();

  expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  expect(screen.getByTestId('lightbox-index')).toHaveTextContent('1');
});

test('uploader can delete own image; non-uploader member gets flag button instead', async () => {
  setAuth({ user: { uid: 'u1' }, memberData: { id: 7 } });
  deleteGalleryImage.mockResolvedValue({});
  renderGallery();
  await settle();

  // Member id 7 uploaded image 1 -> one delete button; image 2 -> flag button
  expect(screen.getAllByTestId('DeleteIcon')).toHaveLength(1);
  expect(screen.getAllByTestId('FlagIcon')).toHaveLength(1);

  // Cancel first, then reopen and confirm
  fireEvent.click(screen.getByTestId('DeleteIcon').closest('button'));
  expect(screen.getByText('Delete Image?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteGalleryImage).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId('DeleteIcon').closest('button'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(deleteGalleryImage).toHaveBeenCalledWith(1, 'u1'));
  await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  expect(screen.getByText('1 photos')).toBeInTheDocument();
});

test('delete failure shows error snackbar', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  setAuth({ user: { uid: 'u1' }, adminModeEnabled: true });
  deleteGalleryImage.mockRejectedValue(new Error('denied'));
  renderGallery();
  await settle();

  fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

  expect(await screen.findByText(/Failed to delete image/)).toBeInTheDocument();
  errSpy.mockRestore();
});

test('member deletion request flow submits reason and marks image as requested', async () => {
  setAuth({ user: { uid: 'u2' }, memberData: { id: 42 } });
  requestGalleryImageDeletion.mockResolvedValue({});
  renderGallery();
  await settle();

  // Non-uploader member: flag buttons on both images
  fireEvent.click(screen.getAllByTestId('FlagIcon')[0].closest('button'));
  expect(screen.getByText('Request Image Deletion / 申请删除图片')).toBeInTheDocument();

  // Cancel closes; reopen
  fireEvent.click(screen.getByRole('button', { name: /Cancel \/ 取消/ }));
  fireEvent.click(screen.getAllByTestId('FlagIcon')[0].closest('button'));

  // Submit disabled until a reason is entered
  const submitButton = screen.getByRole('button', { name: /Submit Request/ });
  expect(submitButton).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'I am in this photo' } });
  expect(submitButton).toBeEnabled();
  fireEvent.click(submitButton);

  await waitFor(() =>
    expect(requestGalleryImageDeletion).toHaveBeenCalledWith(1, 'I am in this photo', 'u2')
  );
  expect(await screen.findByText('Requested')).toBeInTheDocument();
});

test('deletion request failure shows error snackbar', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  setAuth({ user: { uid: 'u2' }, memberData: { id: 42 } });
  requestGalleryImageDeletion.mockRejectedValue(new Error('nope'));
  renderGallery();
  await settle();

  fireEvent.click(screen.getAllByTestId('FlagIcon')[0].closest('button'));
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'reason' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit Request/ }));

  expect(await screen.findByText(/Failed to submit request/)).toBeInTheDocument();
  errSpy.mockRestore();
});

test('admin approves a pending deletion request and image is removed', async () => {
  setAuth({ user: { uid: 'admin1' }, adminModeEnabled: true });
  resolveGalleryDeletionRequest.mockResolvedValue({});
  renderGallery();
  await settle();

  fireEvent.click(screen.getByText('Delete Request'));
  expect(screen.getByText('Review Deletion Request / 审核删除请求')).toBeInTheDocument();
  expect(screen.getByText(/Carl/)).toBeInTheDocument();
  expect(screen.getByText(/Blurry photo/)).toBeInTheDocument();

  // Cancel closes without resolving; reopen
  fireEvent.click(screen.getByRole('button', { name: /Cancel \/ 取消/ }));
  expect(resolveGalleryDeletionRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Delete Request'));

  fireEvent.click(screen.getByRole('button', { name: /Approve Delete/ }));
  await waitFor(() =>
    expect(resolveGalleryDeletionRequest).toHaveBeenCalledWith(55, true, 'admin1')
  );
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument());
  expect(screen.getByText('1 photos')).toBeInTheDocument();
});

test('admin rejects a pending deletion request; image stays, chip clears', async () => {
  setAuth({ user: { uid: 'admin1' }, adminModeEnabled: true });
  resolveGalleryDeletionRequest.mockResolvedValue({});
  renderGallery();
  await settle();

  fireEvent.click(screen.getByText('Delete Request'));
  fireEvent.click(screen.getByRole('button', { name: /Reject/ }));

  await waitFor(() =>
    expect(resolveGalleryDeletionRequest).toHaveBeenCalledWith(55, false, 'admin1')
  );
  expect(screen.getByText('Bob')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Delete Request')).not.toBeInTheDocument());
});

test('review resolve failure shows error snackbar', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  setAuth({ user: { uid: 'admin1' }, adminModeEnabled: true });
  resolveGalleryDeletionRequest.mockRejectedValue(new Error('nope'));
  renderGallery();
  await settle();

  fireEvent.click(screen.getByText('Delete Request'));
  fireEvent.click(screen.getByRole('button', { name: /Approve Delete/ }));

  expect(await screen.findByText(/Failed to resolve request/)).toBeInTheDocument();
  errSpy.mockRestore();
});

test('empty gallery shows the empty state with upload button for members', async () => {
  setAuth({ user: { uid: 'u1' } });
  getEventGallery.mockResolvedValue([]);
  renderGallery();
  await settle();

  expect(screen.getByText('No photos yet')).toBeInTheDocument();
  expect(screen.getByText('upload-button')).toBeInTheDocument();
  // No FAB when there are no images
  expect(screen.queryByText('upload-fab')).not.toBeInTheDocument();
});

test('fetch failure shows error state with back button', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getEventById.mockRejectedValue(new Error('Event not found'));
  renderGallery();

  expect(await screen.findByText('Event not found')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('ArrowBackIcon').closest('button'));
  errSpy.mockRestore();
});

test('back button in header is clickable', async () => {
  renderGallery();
  await settle();
  fireEvent.click(screen.getByTestId('ArrowBackIcon').closest('button'));
});
