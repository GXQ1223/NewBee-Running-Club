import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventGroupGalleryModal from './EventGroupGalleryModal';

jest.mock('./EventGalleryPreview', () => (props) => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'gallery-preview' }, `preview:${props.eventId}`);
});

const GROUP = {
  group_name: 'Brooklyn Half Series',
  group_name_cn: '布鲁克林半马系列',
  event_count: 2,
  events: [
    {
      id: 11,
      name: 'Brooklyn Half 2025',
      chinese_name: '布马 2025',
      date: '2025-05-17T00:00:00',
      location: 'Prospect Park',
      image: '/img/2025.jpg',
    },
    {
      id: 12,
      name: 'Brooklyn Half 2024',
      date: null,
      image: null,
    },
  ],
};

function renderModal(props = {}) {
  const defaults = {
    open: true,
    onClose: jest.fn(),
    group: GROUP,
    onEventClick: jest.fn(),
    onRemoveFromGroup: jest.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...render(<EventGroupGalleryModal {...merged} />), props: merged };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EventGroupGalleryModal', () => {
  test('renders nothing when group is null', () => {
    const { container } = render(
      <EventGroupGalleryModal open onClose={jest.fn()} group={null} onEventClick={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders header with names and event count', () => {
    renderModal();
    expect(screen.getByText('Brooklyn Half Series')).toBeInTheDocument();
    expect(screen.getByText('布鲁克林半马系列')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
  });

  test('omits Chinese group name when absent', () => {
    renderModal({ group: { ...GROUP, group_name_cn: null } });
    expect(screen.queryByText('布鲁克林半马系列')).not.toBeInTheDocument();
  });

  test('renders event cards with year chip, formatted date, location and gallery preview', () => {
    renderModal();
    expect(screen.getByText('Brooklyn Half 2025')).toBeInTheDocument();
    expect(screen.getByText('布马 2025')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument(); // year chip
    expect(screen.getByText('May 17, 2025')).toBeInTheDocument();
    expect(screen.getByText('Prospect Park')).toBeInTheDocument();
    expect(screen.getByText('preview:11')).toBeInTheDocument();
    expect(screen.getByText('preview:12')).toBeInTheDocument();
    // Event with no date renders empty year/date
    expect(screen.getByText('Brooklyn Half 2024')).toBeInTheDocument();
  });

  test('uses fallback image when missing and on image error', () => {
    renderModal();
    const img2024 = screen.getByAltText('Brooklyn Half 2024');
    expect(img2024).toHaveAttribute('src', '/images/2025/20250517_bk_half.jpg');

    const img2025 = screen.getByAltText('Brooklyn Half 2025');
    expect(img2025).toHaveAttribute('src', '/img/2025.jpg');
    fireEvent.error(img2025);
    expect(img2025).toHaveAttribute('src', '/images/2025/20250517_bk_half.jpg');
  });

  test('clicking an event card calls onEventClick', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('Brooklyn Half 2025'));
    expect(props.onEventClick).toHaveBeenCalledWith(GROUP.events[0]);
  });

  test('close button calls onClose', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    expect(props.onClose).toHaveBeenCalled();
  });

  test('handles a group without events array', () => {
    renderModal({ group: { group_name: 'Empty', event_count: 0, events: undefined } });
    expect(screen.getByText('0 events')).toBeInTheDocument();
  });

  describe('admin mode', () => {
    test('shows remove buttons and admin hint', () => {
      renderModal({ adminModeEnabled: true });
      expect(
        screen.getByText(/Right-click or tap the remove button/)
      ).toBeInTheDocument();
      expect(screen.getAllByTestId('RemoveCircleOutlineIcon').length).toBeGreaterThanOrEqual(2);
    });

    test('remove button removes the event without triggering onEventClick', () => {
      const { props } = renderModal({ adminModeEnabled: true });
      const removeButtons = screen
        .getAllByTestId('RemoveCircleOutlineIcon')
        .map((icon) => icon.closest('button'))
        .filter(Boolean);
      fireEvent.click(removeButtons[0]);
      expect(props.onRemoveFromGroup).toHaveBeenCalledWith(11);
      expect(props.onEventClick).not.toHaveBeenCalled();
    });

    test('remove button tolerates missing onRemoveFromGroup', () => {
      renderModal({ adminModeEnabled: true, onRemoveFromGroup: undefined });
      const removeButton = screen
        .getAllByTestId('RemoveCircleOutlineIcon')[0]
        .closest('button');
      expect(() => fireEvent.click(removeButton)).not.toThrow();
    });

    test('right-click opens context menu and Remove from Group fires callback', async () => {
      const { props } = renderModal({ adminModeEnabled: true });
      fireEvent.contextMenu(screen.getByText('Brooklyn Half 2025'), {
        clientX: 120,
        clientY: 140,
      });
      const menuItem = await screen.findByText('Remove from Group');
      fireEvent.click(menuItem);
      expect(props.onRemoveFromGroup).toHaveBeenCalledWith(11);
      await waitFor(() =>
        expect(screen.queryByText('Remove from Group')).not.toBeInTheDocument()
      );
    });

    test('context menu remove works without onRemoveFromGroup', async () => {
      renderModal({ adminModeEnabled: true, onRemoveFromGroup: undefined });
      fireEvent.contextMenu(screen.getByText('Brooklyn Half 2025'));
      fireEvent.click(await screen.findByText('Remove from Group'));
      await waitFor(() =>
        expect(screen.queryByText('Remove from Group')).not.toBeInTheDocument()
      );
    });
  });

  test('right-click does nothing when admin mode is off', () => {
    renderModal({ adminModeEnabled: false });
    fireEvent.contextMenu(screen.getByText('Brooklyn Half 2025'));
    expect(screen.queryByText('Remove from Group')).not.toBeInTheDocument();
  });
});
