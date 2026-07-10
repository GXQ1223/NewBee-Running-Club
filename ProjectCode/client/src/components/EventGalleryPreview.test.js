import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventGalleryPreview from './EventGalleryPreview';
import { getEventGalleryPreview } from '../api/gallery';
import { useAuth } from '../context/AuthContext';

jest.mock('../api/gallery', () => ({ getEventGalleryPreview: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const makePreview = (count, totalCount) => ({
  images: Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    image_url: `/img/${i + 1}.jpg`,
  })),
  total_count: totalCount,
});

function renderPreview(props = {}) {
  return render(
    <MemoryRouter>
      <EventGalleryPreview eventId={42} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
});

describe('EventGalleryPreview', () => {
  test('shows skeletons while loading', () => {
    getEventGalleryPreview.mockReturnValue(new Promise(() => {}));
    const { container } = renderPreview();
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(3);
  });

  test('fetches preview with maxImages+1 and current user uid', async () => {
    getEventGalleryPreview.mockResolvedValue(makePreview(2, 2));
    renderPreview({ maxImages: 4 });
    await waitFor(() =>
      expect(getEventGalleryPreview).toHaveBeenCalledWith(42, 5, 'user-1')
    );
  });

  test('renders nothing when total_count is 0', async () => {
    getEventGalleryPreview.mockResolvedValue(makePreview(0, 0));
    const { container } = renderPreview();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('renders nothing when preview is null', async () => {
    getEventGalleryPreview.mockResolvedValue(null);
    const { container } = renderPreview();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test('renders nothing on fetch error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventGalleryPreview.mockRejectedValue(new Error('network down'));
    const { container } = renderPreview();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('renders nothing when a refetch fails after a successful load', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getEventGalleryPreview.mockResolvedValueOnce(makePreview(2, 2));
    const { container, rerender } = renderPreview({ maxImages: 4 });
    await screen.findAllByRole('img');

    // refetch (triggered by maxImages change) fails while stale preview is set
    getEventGalleryPreview.mockRejectedValueOnce(new Error('down'));
    rerender(
      <MemoryRouter>
        <EventGalleryPreview eventId={42} maxImages={3} />
      </MemoryRouter>
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    consoleSpy.mockRestore();
  });

  test('does not fetch when eventId is missing and keeps skeletons', () => {
    const { container } = render(
      <MemoryRouter>
        <EventGalleryPreview eventId={null} />
      </MemoryRouter>
    );
    expect(getEventGalleryPreview).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });

  test('shows thumbnails without badge when all images fit', async () => {
    getEventGalleryPreview.mockResolvedValue(makePreview(3, 3));
    const { container } = renderPreview({ maxImages: 4 });
    await waitFor(() =>
      expect(container.querySelectorAll('img')).toHaveLength(3)
    );
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  test('caps thumbnails at maxImages and shows "+N" badge for the rest', async () => {
    getEventGalleryPreview.mockResolvedValue(makePreview(5, 9));
    const { container } = renderPreview({ maxImages: 4 });
    await waitFor(() => expect(screen.getByText('+5')).toBeInTheDocument());
    expect(container.querySelectorAll('img')).toHaveLength(4);
    expect(container.querySelectorAll('img')[0]).toHaveAttribute('src', '/img/1.jpg');
  });

  test('clicking the preview navigates to the event gallery', async () => {
    getEventGalleryPreview.mockResolvedValue(makePreview(2, 2));
    renderPreview();
    const imgs = await screen.findAllByRole('img');
    fireEvent.click(imgs[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/events/42/gallery');
  });

  test('passes undefined uid when logged out', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    getEventGalleryPreview.mockResolvedValue(makePreview(1, 1));
    renderPreview();
    await waitFor(() =>
      expect(getEventGalleryPreview).toHaveBeenCalledWith(42, 5, undefined)
    );
  });
});
