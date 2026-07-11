import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { getCarouselBanners, updateBanner } from '../api/banners';
import {
  getActiveSections,
  updateSection,
  reorderSections,
  uploadImage,
} from '../api/homepageSections';
import { getEventsByStatus } from '../api';
import { updateEvent } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

jest.mock('../api/banners', () => ({
  getCarouselBanners: jest.fn(),
  updateBanner: jest.fn(),
}));
jest.mock('../api/homepageSections', () => ({
  getActiveSections: jest.fn(),
  updateSection: jest.fn(),
  reorderSections: jest.fn(),
  uploadImage: jest.fn(),
}));
jest.mock('../api', () => ({
  getEventsByStatus: jest.fn(),
  updateEvent: jest.fn(),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Probe replacement for EventModal so we can observe open/close and the event
jest.mock('../components/EventModal', () => {
  const React = require('react');
  return function MockEventModal({ open, onClose, event }) {
    if (!open) return null;
    return React.createElement(
      'div',
      { 'data-testid': 'event-modal' },
      React.createElement('span', null, event ? event.label_en || event.event_name : 'no-event'),
      React.createElement('button', { onClick: onClose }, 'close-event-modal')
    );
  };
});

// Probe replacement for ImagePositionEditor: one button drives onSave + onPositionSaved
jest.mock('../components/ImagePositionEditor', () => {
  const React = require('react');
  return function MockImagePositionEditor({ onSave, onPositionSaved }) {
    return React.createElement(
      'button',
      {
        'data-testid': 'save-position',
        onClick: async () => {
          await onSave('left top');
          onPositionSaved('left top');
        },
      },
      'save-position'
    );
  };
});

// Capture the DndContext onDragEnd so tests can drive handleDragEnd directly:
// jsdom has no element geometry, so real pointer/keyboard dnd cannot fire drops.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  const React = require('react');
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }) => {
      global.__capturedOnDragEnd = onDragEnd;
      return React.createElement(React.Fragment, null, children);
    },
  };
});

const banners = [
  {
    id: 10,
    image_url: '/img/one.jpg',
    alt_text: 'Banner One Alt',
    label_en: 'Banner One',
    label_cn: '横幅一',
    link_path: '/about',
    source_type: 'manual',
    event_date: '2026-07-04',
  },
  {
    id: 20,
    image_url: '/img/two.jpg',
    label_en: 'Banner Two',
    label_cn: '横幅二',
    source_type: 'event_highlight',
    event_id: 42,
  },
  {
    id: 30,
    image_url: '/img/three.jpg',
    label_en: 'Banner Three',
    label_cn: '横幅三',
    source_type: 'manual',
    event_date: 'not-a-date',
  },
];

const apiSections = [
  { id: 1, title_en: 'Sec A', title_cn: '甲', link_path: '/a', image_url: '/img/a.jpg', is_active: true },
  { id: 2, title_en: 'Sec B', title_cn: '乙', link_path: '/b', image_url: null, is_active: true },
  { id: 3, title_en: 'Sec C', title_cn: '丙', link_path: '/c', image_url: '/img/c.jpg', image_position: 'top', is_active: true },
];

function setAdminMode(enabled) {
  useAdmin.mockReturnValue({ adminModeEnabled: enabled });
}

async function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
  // Wait for the carousel spinner to be replaced by loaded content
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
}

const flushPromises = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  jest.clearAllMocks();
  delete global.__capturedOnDragEnd;
  useAuth.mockReturnValue({ currentUser: { uid: 'uid-1' } });
  setAdminMode(false);
  getCarouselBanners.mockResolvedValue(banners);
  getActiveSections.mockResolvedValue(apiSections);
  getEventsByStatus.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('hero banner and loading', () => {
  test('renders the club banner and falls back on hero image error', async () => {
    await renderHome();
    expect(screen.getByRole('heading', { name: 'NewBee Running Club' })).toBeInTheDocument();
    const hero = screen.getByAltText('NewBee Running Club');
    fireEvent.error(hero);
    expect(hero.src).toContain('/master-image-1.jpg');
  });

  test('shows loading placeholders while the APIs are pending', () => {
    getCarouselBanners.mockReturnValue(new Promise(() => {}));
    getActiveSections.mockReturnValue(new Promise(() => {}));
    getEventsByStatus.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Sec A')).not.toBeInTheDocument();
  });
});

describe('carousel', () => {
  test('renders banners with the label overlay for the current banner', async () => {
    await renderHome();
    expect(screen.getByRole('heading', { name: 'Banner One' })).toBeInTheDocument();
    expect(screen.getByAltText('Banner One Alt')).toBeInTheDocument();
    expect(screen.getByAltText('Banner Two')).toBeInTheDocument();
    expect(screen.getByAltText('Banner Three')).toBeInTheDocument();
  });

  test('auto-rotates every 5 seconds and wraps around', async () => {
    jest.useFakeTimers();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await flushPromises();
    expect(screen.getByRole('heading', { name: 'Banner One' })).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByRole('heading', { name: 'Banner Two' })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByRole('heading', { name: 'Banner Three' })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByRole('heading', { name: 'Banner One' })).toBeInTheDocument();
  });

  test('indicator dots switch the current banner', async () => {
    await renderHome();
    const carousel = screen.getByAltText('Banner One Alt').parentElement;
    const dots = [...carousel.children].find(
      (el) => el.tagName === 'DIV' && el.children.length === banners.length && el.textContent === ''
    );
    fireEvent.click(dots.children[2]);
    expect(screen.getByRole('heading', { name: 'Banner Three' })).toBeInTheDocument();
  });

  test('clicking the carousel opens the current banner (navigates for link banners)', async () => {
    await renderHome();
    const carousel = screen.getByAltText('Banner One Alt').parentElement;
    fireEvent.mouseEnter(carousel);
    fireEvent.click(carousel);
    fireEvent.mouseLeave(carousel);
    expect(mockNavigate).toHaveBeenCalledWith('/about');
  });

  test('carousel image errors fall back to the master image', async () => {
    await renderHome();
    const img = screen.getByAltText('Banner Two');
    fireEvent.error(img);
    expect(img.src).toContain('/master-image-1.jpg');
  });
});

describe('Latest Events panel', () => {
  test('shows a date bubble for banners with event_date and a thumbnail otherwise', async () => {
    await renderHome();
    // Banner One: 2026-07-04 -> day 4, month JUL
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('JUL')).toBeInTheDocument();
    // Banner Two (no date) and Banner Three (invalid date) -> image thumbnails
    const thumbTwo = document.querySelectorAll('img[src="/img/two.jpg"]');
    expect(thumbTwo.length).toBe(2); // carousel slide + list thumbnail
    const thumbThree = document.querySelectorAll('img[src="/img/three.jpg"]');
    expect(thumbThree.length).toBe(2);
    // Thumbnail error hides it
    fireEvent.error(thumbTwo[1]);
    expect(thumbTwo[1]).toHaveStyle('visibility: hidden');
  });

  test('clicking an event-linked item opens the EventModal probe and it can be closed', async () => {
    await renderHome();
    // Initially the overlay heading shows Banner One, so this text is the list item
    fireEvent.click(screen.getByText('Banner Two'));
    const modal = screen.getByTestId('event-modal');
    expect(within(modal).getByText('Banner Two')).toBeInTheDocument();

    fireEvent.click(within(modal).getByText('close-event-modal'));
    expect(screen.queryByTestId('event-modal')).not.toBeInTheDocument();
  });

  test('clicking a link item navigates and selects it in the carousel', async () => {
    await renderHome();
    const listItem = screen.getAllByText('Banner One')[1]; // [0] is the overlay heading
    fireEvent.click(listItem);
    expect(mockNavigate).toHaveBeenCalledWith('/about');
  });

  test('items without event or link do nothing on click', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('Banner Three'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('event-modal')).not.toBeInTheDocument();
  });

  test('View Calendar button navigates to /calendar', async () => {
    await renderHome();
    fireEvent.click(screen.getByRole('button', { name: /View Calendar/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/calendar');
  });
});

describe('fallbacks', () => {
  test('uses fallback banners and sections when the APIs reject', async () => {
    getCarouselBanners.mockRejectedValue(new Error('down'));
    getActiveSections.mockRejectedValue(new Error('down'));
    getEventsByStatus.mockRejectedValue(new Error('down'));
    await renderHome();

    expect(screen.getByRole('heading', { name: 'About Us' })).toBeInTheDocument();
    // Some titles also appear as fallback banner labels, so use getAllByText
    ['Event Registration', 'Memories', 'Upcoming', 'Club Credits/Records', 'Join NewBee'].forEach(
      (title) => expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    );
    // Fallback sections without an image show the placeholder
    expect(screen.getByText('Upcoming Image Coming Soon')).toBeInTheDocument();
  });

  test('uses fallbacks when the APIs return empty lists', async () => {
    getCarouselBanners.mockResolvedValue([]);
    getActiveSections.mockResolvedValue([]);
    await renderHome();
    expect(screen.getByRole('heading', { name: 'About Us' })).toBeInTheDocument();
    expect(screen.getByText('Event Registration')).toBeInTheDocument();
  });
});

describe('sections grid', () => {
  test('renders section cards as links, with image or placeholder', async () => {
    await renderHome();
    const cardA = screen.getByText('Sec A').closest('a');
    expect(cardA).toHaveAttribute('href', '/a');
    expect(screen.getByAltText('Sec A')).toBeInTheDocument();
    expect(screen.getByText('Sec B Image Coming Soon')).toBeInTheDocument();

    // hover + image error handlers
    fireEvent.mouseEnter(cardA);
    fireEvent.mouseLeave(cardA);
    const imgA = screen.getByAltText('Sec A');
    fireEvent.error(imgA);
    expect(imgA).toHaveStyle('display: none');
  });

  test('no admin affordances outside admin mode', async () => {
    await renderHome();
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DragIndicatorIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('CropIcon')).not.toBeInTheDocument();
    expect(global.__capturedOnDragEnd).toBeUndefined();
  });

  test('Event Registration card cycles upcoming event images and links to each event', async () => {
    jest.useFakeTimers();
    getActiveSections.mockResolvedValue([
      { id: 9, title_en: 'Event Registration', title_cn: '活动报名', link_path: '/calendar', is_active: true },
    ]);
    getEventsByStatus.mockResolvedValue([
      { id: 11, image_url: '/img/e1.jpg', title: 'E1' },
      { id: 12, poster_url: '/img/e2.jpg', name: 'E2' },
      { id: 13, title: 'No image event' },
    ]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await flushPromises();

    const card = screen.getByText('Event Registration').closest('a');
    expect(card).toHaveAttribute('href', '/calendar?event=11');
    expect(screen.getByText('Open 报名中')).toBeInTheDocument();
    expect(screen.getByAltText('E1')).toBeInTheDocument();
    expect(screen.getByAltText('E2')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(5000));
    expect(card).toHaveAttribute('href', '/calendar?event=12');
    act(() => jest.advanceTimersByTime(5000));
    expect(card).toHaveAttribute('href', '/calendar?event=11');

    const img = screen.getByAltText('E1');
    fireEvent.error(img);
    expect(img).toHaveStyle('display: none');
  });
});

describe('admin mode', () => {
  beforeEach(() => setAdminMode(true));

  test('shows edit, drag, and crop affordances', async () => {
    await renderHome();
    expect(screen.getAllByTestId('EditIcon')).toHaveLength(3);
    expect(screen.getAllByTestId('DragIndicatorIcon')).toHaveLength(3);
    // Carousel crop + section crops for Sec A and Sec C (Sec B has no image)
    expect(screen.getAllByTestId('CropIcon')).toHaveLength(3);

    // Drag handle click is a no-op (prevents navigation)
    fireEvent.click(screen.getAllByTestId('DragIndicatorIcon')[0].closest('button'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('carousel crop saves position via updateBanner for manual banners', async () => {
    await renderHome();
    fireEvent.click(screen.getAllByTestId('CropIcon')[0].closest('button'));
    expect(screen.getByText('Adjust Image Position / 调整图片位置')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-position'));
    });
    await waitFor(() =>
      expect(updateBanner).toHaveBeenCalledWith(10, { image_position: 'left top' }, 'uid-1')
    );
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
    expect(updateEvent).not.toHaveBeenCalled();
  });

  test('carousel crop saves position via updateEvent for event-highlight banners', async () => {
    getCarouselBanners.mockResolvedValue([banners[1]]); // event_highlight, event_id 42
    await renderHome();
    fireEvent.click(screen.getAllByTestId('CropIcon')[0].closest('button'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-position'));
    });

    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(42, { image_position: 'left top' }, 'uid-1')
    );
    expect(updateBanner).not.toHaveBeenCalled();
  });

  test('carousel crop with a non-persistable banner saves nothing', async () => {
    getCarouselBanners.mockResolvedValue([{ id: 0, image_url: '/img/x.jpg', label_en: 'X', source_type: 'manual' }]);
    await renderHome();
    fireEvent.click(screen.getAllByTestId('CropIcon')[0].closest('button'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-position'));
    });
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
    expect(updateBanner).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  test('carousel position dialog can be closed without saving', async () => {
    await renderHome();
    fireEvent.click(screen.getAllByTestId('CropIcon')[0].closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Close \/ 关闭/ }));
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );

    // Reopen and close via Escape to exercise the Dialog onClose handler
    fireEvent.click(screen.getAllByTestId('CropIcon')[0].closest('button'));
    fireEvent.keyDown(screen.getByText('Adjust Image Position / 调整图片位置'), {
      key: 'Escape',
      code: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
  });

  test('section crop saves position via updateSection', async () => {
    updateSection.mockResolvedValue({});
    await renderHome();
    const cardA = screen.getByText('Sec A').closest('a');
    fireEvent.click(within(cardA).getByTestId('CropIcon').closest('button'));
    expect(screen.getByText('Adjust Image Position / 调整图片位置')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-position'));
    });
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith(1, { image_position: 'left top' }, 'uid-1')
    );
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
  });

  test('section position dialog can be closed without saving', async () => {
    await renderHome();
    const cardC = screen.getByText('Sec C').closest('a');
    fireEvent.click(within(cardC).getByTestId('CropIcon').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Close \/ 关闭/ }));
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
    expect(updateSection).not.toHaveBeenCalled();

    // Reopen and close via Escape to exercise the Dialog onClose handler
    fireEvent.click(within(cardC).getByTestId('CropIcon').closest('button'));
    fireEvent.keyDown(screen.getByText('Adjust Image Position / 调整图片位置'), {
      key: 'Escape',
      code: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByText('Adjust Image Position / 调整图片位置')).not.toBeInTheDocument()
    );
  });
});

describe('section edit dialog', () => {
  beforeEach(() => setAdminMode(true));

  async function openEditDialog(sectionTitle = 'Sec A') {
    await renderHome();
    const card = screen.getByText(sectionTitle).closest('a');
    fireEvent.click(within(card).getByTestId('EditIcon').closest('button'));
    expect(screen.getByText('Edit Section / 编辑板块')).toBeInTheDocument();
  }

  test('prefills the form, saves changed titles without resending the image', async () => {
    updateSection.mockResolvedValue({ ...apiSections[0], title_en: 'Sec A2' });
    await openEditDialog();

    expect(screen.getByLabelText(/Title \(English\)/)).toHaveValue('Sec A');
    expect(screen.getByLabelText(/Link Path/)).toHaveValue('/a');

    fireEvent.change(screen.getByLabelText(/Title \(English\)/), { target: { value: 'Sec A2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith(
        1,
        {
          title_en: 'Sec A2',
          title_cn: '甲',
          link_path: '/a',
          is_active: true,
          image_position: null,
        },
        'uid-1'
      )
    );
    // image unchanged -> image_url is not sent
    expect(updateSection.mock.calls[0][1]).not.toHaveProperty('image_url');
    await waitFor(() =>
      expect(screen.queryByText('Edit Section / 编辑板块')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Sec A2')).toBeInTheDocument();
  });

  test('uploads a newly selected image and saves its URL', async () => {
    uploadImage.mockResolvedValue({ url: 'https://s3.example.com/pic.png' });
    updateSection.mockResolvedValue({ ...apiSections[0], image_url: 'https://s3.example.com/pic.png' });
    await openEditDialog();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['a'], 'pic.png', { type: 'image/png' })] } });
    expect(screen.getByText('Selected: pic.png')).toBeInTheDocument();
    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:mock');

    // Selecting a second file revokes the previous blob preview
    fireEvent.change(fileInput, { target: { files: [new File(['b'], 'pic2.png', { type: 'image/png' })] } });
    expect(screen.getByText('Selected: pic2.png')).toBeInTheDocument();

    // Preview error handler hides the image
    const preview = screen.getByAltText('Preview');
    fireEvent.error(preview);
    expect(preview).toHaveStyle('display: none');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'uid-1'));
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ image_url: 'https://s3.example.com/pic.png' }),
        'uid-1'
      )
    );
  });

  test('shows an error snackbar and keeps the dialog open when the upload fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    uploadImage.mockRejectedValue(new Error('upload failed'));
    await openEditDialog();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['a'], 'pic.png', { type: 'image/png' })] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    expect(await screen.findByText('Failed to upload image / 上传图片失败')).toBeInTheDocument();
    expect(updateSection).not.toHaveBeenCalled();
    expect(screen.getByText('Edit Section / 编辑板块')).toBeInTheDocument();

    // Snackbar close handler
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Failed to upload image / 上传图片失败')).not.toBeInTheDocument()
    );
    errSpy.mockRestore();
  });

  test('shows an error snackbar when saving the section fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    updateSection.mockRejectedValue(new Error('save failed'));
    await openEditDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(await screen.findByText('Failed to save section / 保存板块失败')).toBeInTheDocument();

    // Dismiss via clickaway to exercise the Snackbar onClose handler.
    // ClickAwayListener only arms itself after a macrotask, so wait one.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(document.body);
    await waitFor(() =>
      expect(screen.queryByText('Failed to save section / 保存板块失败')).not.toBeInTheDocument()
    );
    errSpy.mockRestore();
  });

  test('removing the image sends image_url null', async () => {
    updateSection.mockResolvedValue({ ...apiSections[0], image_url: null });
    await openEditDialog();

    // Select a file first so remove also revokes the blob preview URL
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [new File(['a'], 'pic.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Remove \/ 删除/ }));
    expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ image_url: null }),
        'uid-1'
      )
    );
  });

  test('status select toggles is_active in the payload', async () => {
    updateSection.mockResolvedValue({ ...apiSections[0], is_active: false });
    await openEditDialog();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Inactive / 隐藏'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    await waitFor(() =>
      expect(updateSection).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ is_active: false }),
        'uid-1'
      )
    );
  });

  test('save is disabled when required fields are cleared', async () => {
    await openEditDialog();
    fireEvent.change(screen.getByLabelText(/Title \(English\)/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('save does nothing without a signed-in user', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    await openEditDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(updateSection).not.toHaveBeenCalled();
  });

  test('cancel closes the dialog without saving', async () => {
    await openEditDialog();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(screen.queryByText('Edit Section / 编辑板块')).not.toBeInTheDocument()
    );
    expect(updateSection).not.toHaveBeenCalled();
  });
});

describe('drag-and-drop reorder', () => {
  beforeEach(() => setAdminMode(true));

  const sectionOrder = () =>
    screen.getAllByText(/^Sec [ABC]$/).map((el) => el.textContent);

  test('drag end reorders sections and persists the new order', async () => {
    reorderSections.mockResolvedValue({});
    await renderHome();
    expect(global.__capturedOnDragEnd).toBeDefined();

    await act(async () => {
      await global.__capturedOnDragEnd({ active: { id: 1 }, over: { id: 3 } });
    });
    expect(sectionOrder()).toEqual(['Sec B', 'Sec C', 'Sec A']);
    expect(reorderSections).toHaveBeenCalledWith([2, 3, 1], 'uid-1');
  });

  test('reverts the order and shows a snackbar when persisting fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    reorderSections.mockRejectedValue(new Error('reorder failed'));
    await renderHome();

    await act(async () => {
      await global.__capturedOnDragEnd({ active: { id: 1 }, over: { id: 3 } });
    });
    expect(await screen.findByText('Failed to reorder sections / 排序失败')).toBeInTheDocument();
    expect(sectionOrder()).toEqual(['Sec A', 'Sec B', 'Sec C']);
    errSpy.mockRestore();
  });

  test('does nothing when dropped outside a target or on itself', async () => {
    await renderHome();
    await act(async () => {
      await global.__capturedOnDragEnd({ active: { id: 1 }, over: null });
    });
    await act(async () => {
      await global.__capturedOnDragEnd({ active: { id: 1 }, over: { id: 1 } });
    });
    expect(sectionOrder()).toEqual(['Sec A', 'Sec B', 'Sec C']);
    expect(reorderSections).not.toHaveBeenCalled();
  });

  test('reorders locally but does not persist without a signed-in user', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    await renderHome();
    await act(async () => {
      await global.__capturedOnDragEnd({ active: { id: 1 }, over: { id: 2 } });
    });
    expect(sectionOrder()).toEqual(['Sec B', 'Sec A', 'Sec C']);
    expect(reorderSections).not.toHaveBeenCalled();
  });
});
