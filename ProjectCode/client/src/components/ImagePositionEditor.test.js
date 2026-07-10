import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImagePositionEditor from './ImagePositionEditor';
import { updateEvent } from '../api';
import { useAuth } from '../context/AuthContext';

jest.mock('../api', () => ({ updateEvent: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

// jsdom may lack PointerEvent / pointer capture APIs
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, params = {}) {
        super(type, params);
        this.pointerId = params.pointerId;
      }
    };
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

const getImage = (container) => container.querySelector('img');
// The drag overlay is rendered immediately after the img while editing
const getOverlay = (container) => getImage(container).nextElementSibling;

function startEditing(container) {
  fireEvent.click(screen.getByTestId('CropIcon').closest('button'));
  const overlay = getOverlay(container);
  expect(overlay).toBeTruthy();
  overlay.getBoundingClientRect = () => ({
    width: 100,
    height: 100,
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
  });
  return overlay;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
});

describe('ImagePositionEditor', () => {
  test('renders image at currentPosition and defaults to center center', () => {
    const { container, rerender } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="30% 40%" />
    );
    const img = getImage(container);
    expect(img).toHaveAttribute('src', '/img/a.jpg');
    expect(img).toHaveStyle({ objectPosition: '30% 40%' });

    rerender(<ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition={null} />);
    expect(getImage(container)).toHaveStyle({ objectPosition: 'center center' });
  });

  test('syncs position when parent passes a new currentPosition', () => {
    const { container, rerender } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="30% 40%" />
    );
    rerender(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="60% 70%" />
    );
    expect(getImage(container)).toHaveStyle({ objectPosition: '60% 70%' });
  });

  test('edit button reveals drag overlay and save/cancel controls', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
    );
    expect(screen.getByTestId('CropIcon')).toBeInTheDocument();
    startEditing(container);
    expect(screen.queryByTestId('CropIcon')).not.toBeInTheDocument();
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
    expect(screen.getByTestId('CloseIcon')).toBeInTheDocument();
  });

  test('dragging moves the image position opposite to the pointer delta', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
    );
    const overlay = startEditing(container);
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 60, clientY: 70, pointerId: 1 });
    expect(getImage(container)).toHaveStyle({ objectPosition: '40.0% 30.0%' });
    fireEvent.pointerUp(overlay, { pointerId: 1 });
    // after release, moves are ignored
    fireEvent.pointerMove(overlay, { clientX: 90, clientY: 90, pointerId: 1 });
    expect(getImage(container)).toHaveStyle({ objectPosition: '40.0% 30.0%' });
  });

  test('drag positions are clamped to 0-100%', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
    );
    const overlay = startEditing(container);
    fireEvent.pointerDown(overlay, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 500, clientY: -500, pointerId: 1 });
    expect(getImage(container)).toHaveStyle({ objectPosition: '0.0% 100.0%' });
  });

  test('non-numeric currentPosition parses to 50/50 for dragging', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="center center" />
    );
    const overlay = startEditing(container);
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 40, clientY: 40, pointerId: 1 });
    expect(getImage(container)).toHaveStyle({ objectPosition: '60.0% 60.0%' });
  });

  test('pointerUp without an active drag is ignored', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
    );
    const overlay = startEditing(container);
    expect(() => fireEvent.pointerUp(overlay, { pointerId: 1 })).not.toThrow();
  });

  test('save without onSave persists via updateEvent and exits editing', async () => {
    updateEvent.mockResolvedValue({});
    const onPositionSaved = jest.fn();
    const { container } = render(
      <ImagePositionEditor
        eventId={5}
        imageUrl="/img/a.jpg"
        currentPosition="50% 50%"
        onPositionSaved={onPositionSaved}
      />
    );
    const overlay = startEditing(container);
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(overlay, { pointerId: 1 });

    fireEvent.click(screen.getByTestId('CheckIcon').closest('button'));
    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith(5, { image_position: '40.0% 40.0%' }, 'admin-1')
    );
    await waitFor(() => expect(onPositionSaved).toHaveBeenCalledWith('40.0% 40.0%'));
    await waitFor(() => expect(screen.getByTestId('CropIcon')).toBeInTheDocument());
  });

  test('save uses the onSave callback when provided', async () => {
    const onSave = jest.fn().mockResolvedValue();
    const onPositionSaved = jest.fn();
    const { container } = render(
      <ImagePositionEditor
        imageUrl="/img/a.jpg"
        currentPosition="25% 75%"
        onSave={onSave}
        onPositionSaved={onPositionSaved}
      />
    );
    startEditing(container);
    fireEvent.click(screen.getByTestId('CheckIcon').closest('button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('25% 75%'));
    expect(updateEvent).not.toHaveBeenCalled();
    await waitFor(() => expect(onPositionSaved).toHaveBeenCalledWith('25% 75%'));
  });

  test('save works without onPositionSaved', async () => {
    const onSave = jest.fn().mockResolvedValue();
    const { container } = render(
      <ImagePositionEditor imageUrl="/img/a.jpg" currentPosition="25% 75%" onSave={onSave} />
    );
    startEditing(container);
    fireEvent.click(screen.getByTestId('CheckIcon').closest('button'));
    await waitFor(() => expect(screen.getByTestId('CropIcon')).toBeInTheDocument());
  });

  test('save failure shows an error and stays in edit mode', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onSave = jest.fn().mockRejectedValue(new Error('denied'));
    const onPositionSaved = jest.fn();
    const { container } = render(
      <ImagePositionEditor
        imageUrl="/img/a.jpg"
        currentPosition="25% 75%"
        onSave={onSave}
        onPositionSaved={onPositionSaved}
      />
    );
    startEditing(container);
    fireEvent.click(screen.getByTestId('CheckIcon').closest('button'));
    expect(await screen.findByText('Failed to save position / 保存位置失败')).toBeInTheDocument();
    expect(onPositionSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument(); // still editing
    consoleSpy.mockRestore();
  });

  test('save is blocked when no user is logged in', () => {
    useAuth.mockReturnValue({ currentUser: null });
    const onSave = jest.fn();
    const { container } = render(
      <ImagePositionEditor imageUrl="/img/a.jpg" currentPosition="25% 75%" onSave={onSave} />
    );
    startEditing(container);
    fireEvent.click(screen.getByTestId('CheckIcon').closest('button'));
    expect(onSave).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument();
  });

  test('cancel restores the original position and exits editing', () => {
    const { container } = render(
      <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
    );
    const overlay = startEditing(container);
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 70, clientY: 70, pointerId: 1 });
    expect(getImage(container)).toHaveStyle({ objectPosition: '30.0% 30.0%' });

    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    expect(getImage(container)).toHaveStyle({ objectPosition: '50% 50%' });
    expect(screen.getByTestId('CropIcon')).toBeInTheDocument();
  });

  test('clicks are contained while editing but bubble when idle', () => {
    const parentClick = jest.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <ImagePositionEditor eventId={5} imageUrl="/img/a.jpg" currentPosition="50% 50%" />
      </div>
    );
    // idle: clicking the wrapper's inner box bubbles up
    fireEvent.click(getImage(container).parentElement);
    expect(parentClick).toHaveBeenCalledTimes(1);

    const overlay = startEditing(container);
    fireEvent.click(overlay);
    expect(parentClick).toHaveBeenCalledTimes(1); // stopped
  });
});
