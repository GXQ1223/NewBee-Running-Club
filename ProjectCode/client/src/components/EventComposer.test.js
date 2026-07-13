import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventComposer from './EventComposer';
import {
  createEvent, updateEvent, getEventWithRecurrence,
  createEventRecurrence, updateEventRecurrence, deleteEventRecurrence,
} from '../api';
import { uploadImage } from '../api/homepageSections';

jest.mock('./EventCard', () => ({ event }) => (
  <div data-testid="card-preview">{event.name}</div>
));
jest.mock('../context', () => ({ useAuth: jest.fn() }));
jest.mock('../hooks', () => ({
  useAutoFillOnTab: () => () => {},
  useTranslationAutoFill: () => ({
    handleKeyDown: () => {},
    handleBlur: () => {},
    translations: {},
    isTranslating: false,
  }),
}));
jest.mock('../api', () => ({
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  getEventWithRecurrence: jest.fn(),
  createEventRecurrence: jest.fn(),
  updateEventRecurrence: jest.fn(),
  deleteEventRecurrence: jest.fn(),
}));
jest.mock('../api/homepageSections', () => ({ uploadImage: jest.fn() }));

const { useAuth } = require('../context');

describe('EventComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    createEvent.mockResolvedValue({ id: 42 });
    updateEvent.mockResolvedValue({ id: 7 });
    createEventRecurrence.mockResolvedValue({});
    updateEventRecurrence.mockResolvedValue({});
    deleteEventRecurrence.mockResolvedValue({});
    uploadImage.mockResolvedValue({ url: 'https://s3/img.jpg' });
  });

  test('create mode defaults date to today and shows live preview', () => {
    render(<EventComposer open onClose={jest.fn()} />);
    const today = new Date().toISOString().split('T')[0];
    expect(screen.getByLabelText(/Date \/ 日期/)).toHaveValue(today);
    expect(screen.getByTestId('card-preview')).toHaveTextContent('Event name');
    expect(getEventWithRecurrence).not.toHaveBeenCalled();
  });

  test('Continue is gated on name; error shows inline', () => {
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('Required / 必填')).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByLabelText(/Event Name/)).toBeInTheDocument();
  });

  test('stepping through reaches Details and Publish', () => {
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByLabelText(/Description \/ 描述/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByLabelText(/Status \/ 状态/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByLabelText(/Description \/ 描述/)).toBeInTheDocument();
  });

  test('creates event with empty strings nulled and calls onSaved + onClose', async () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();
    render(<EventComposer open onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Event/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [payload, uid] = createEvent.mock.calls[0];
    expect(uid).toBe('admin-1');
    expect(payload.name).toBe('Fun Run');
    expect(payload.chinese_name).toBeNull();
    expect(payload.status).toBe('Upcoming');
    expect(payload.is_recurring).toBeUndefined();
    expect(createEventRecurrence).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({ id: 42 });
  });

  test('displays stored 12-hour time in the time picker', () => {
    getEventWithRecurrence.mockResolvedValue(null);
    render(<EventComposer open onClose={jest.fn()} />);
    const time = screen.getByLabelText(/Time \/ 时间/);
    fireEvent.change(time, { target: { value: '18:30' } });
    expect(time).toHaveValue('18:30');
  });

  test('invalid signup link shows error and blocks save', async () => {
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Signup Link/), { target: { value: 'not-a-url' } });
    expect(screen.getByText(/Must start with http/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create Event/ }));
    await waitFor(() => expect(screen.getByLabelText(/Signup Link/)).toBeInTheDocument());
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('image upload happens immediately on file select', async () => {
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    // MUI Dialog portals to document.body, so query the document
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file, 'admin-1'));
    expect(await screen.findByText(/Replace Image/)).toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  test('rejects non-image and oversized files without uploading', async () => {
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/Please select an image file/)).toBeInTheDocument();
    const big = new File([new ArrayBuffer(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/less than 5MB/)).toBeInTheDocument();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  test('edit mode re-fetches authoritative state and pre-fills recurrence', async () => {
    getEventWithRecurrence.mockResolvedValue({
      id: 7,
      name: 'Saturday Long Run',
      chinese_name: '周六长跑',
      date: '2026-07-19',
      time: '8:00 AM',
      status: 'Upcoming',
      is_highlight: false,
      recurrence: { recurrence_type: 'weekly', days_of_week: '6', end_date: null },
    });
    render(<EventComposer open onClose={jest.fn()} event={{ id: 7, title: 'Stale Cache Name' }} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Event Name/)).toHaveValue('Saturday Long Run')
    );
    expect(getEventWithRecurrence).toHaveBeenCalledWith(7);
    expect(screen.getByLabelText(/Time \/ 时间/)).toHaveValue('08:00');
  });

  test('edit save calls updateEvent and keeps existing recurrence rule updated', async () => {
    getEventWithRecurrence.mockResolvedValue({
      id: 7,
      name: 'Saturday Long Run',
      date: '2026-07-19',
      status: 'Upcoming',
      recurrence: { recurrence_type: 'weekly', days_of_week: '6' },
    });
    const onSaved = jest.fn();
    render(<EventComposer open onClose={jest.fn()} event={{ id: 7 }} onSaved={onSaved} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Event Name/)).toHaveValue('Saturday Long Run')
    );
    fireEvent.click(screen.getByRole('button', { name: /Save Event/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateEvent.mock.calls[0][0]).toBe(7);
    expect(updateEventRecurrence).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ recurrence_type: 'weekly', days_of_week: '6' }),
      'admin-1'
    );
  });

  test('disabling recurrence on an event that had a rule deletes the rule', async () => {
    getEventWithRecurrence.mockResolvedValue({
      id: 7,
      name: 'Saturday Long Run',
      date: '2026-07-19',
      status: 'Upcoming',
      recurrence: { recurrence_type: 'weekly', days_of_week: '6' },
    });
    render(<EventComposer open onClose={jest.fn()} event={{ id: 7 }} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Event Name/)).toHaveValue('Saturday Long Run')
    );
    // Go to Publish and turn recurrence off
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(screen.getByLabelText(/Enable recurrence/));
    fireEvent.click(screen.getByRole('button', { name: /Save Event/ }));
    await waitFor(() => expect(deleteEventRecurrence).toHaveBeenCalledWith(7, 'admin-1'));
    expect(updateEventRecurrence).not.toHaveBeenCalled();
  });

  test('save failure shows error snackbar and keeps dialog open', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createEvent.mockRejectedValue(new Error('boom'));
    const onClose = jest.fn();
    render(<EventComposer open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Event/ }));
    expect(await screen.findByText(/Error: boom/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('create recurrence falls back to update on 400 (stale state)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('exists');
    err.status = 400;
    createEventRecurrence.mockRejectedValue(err);
    render(<EventComposer open onClose={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event Name/), { target: { value: 'Fun Run' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(screen.getByLabelText(/Enable recurrence/));
    fireEvent.click(screen.getByRole('button', { name: /Create Event/ }));
    await waitFor(() => expect(updateEventRecurrence).toHaveBeenCalledWith(42, expect.anything(), 'admin-1'));
    consoleSpy.mockRestore();
  });
});
