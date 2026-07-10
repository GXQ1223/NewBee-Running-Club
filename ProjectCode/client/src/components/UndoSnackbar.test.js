import { render, screen, fireEvent, act } from '@testing-library/react';
import UndoSnackbar from './UndoSnackbar';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders the message and an undo button with a 5 second countdown', () => {
  render(<UndoSnackbar open message="Events merged" onClose={() => {}} onUndo={() => {}} />);

  expect(screen.getByText('Events merged')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Undo \(5s\)/ })).toBeInTheDocument();
});

test('does not render when closed', () => {
  render(<UndoSnackbar open={false} message="Hidden" onClose={() => {}} />);
  expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
});

test('counts down each second and stops at zero', () => {
  render(<UndoSnackbar open message="Merged" onClose={() => {}} autoHideDuration={60000} />);

  act(() => {
    jest.advanceTimersByTime(2000);
  });
  expect(screen.getByText(/Undo \(3s\)/)).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(screen.getByText(/Undo \(0s\)/)).toBeInTheDocument();
});

test('clicking Undo fires onUndo then onClose', () => {
  const onUndo = jest.fn();
  const onClose = jest.fn();
  render(<UndoSnackbar open message="Merged" onClose={onClose} onUndo={onUndo} />);

  fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('clicking Undo without an onUndo handler still closes', () => {
  const onClose = jest.fn();
  render(<UndoSnackbar open message="Merged" onClose={onClose} />);

  fireEvent.click(screen.getByRole('button', { name: /Undo/ }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('clicking the close icon calls onClose', () => {
  const onClose = jest.fn();
  render(<UndoSnackbar open message="Merged" onClose={onClose} onUndo={() => {}} />);

  fireEvent.click(screen.getByLabelText('close'));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('ignores clickaway events', () => {
  const onClose = jest.fn();
  render(<UndoSnackbar open message="Merged" onClose={onClose} onUndo={() => {}} />);

  // MUI's ClickAwayListener arms itself on a setTimeout(0); advance past it,
  // then click outside the snackbar so MUI reports reason "clickaway".
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  fireEvent.click(document.body);

  expect(onClose).not.toHaveBeenCalled();
});

test('auto-hides via onClose after the default 5 seconds', () => {
  const onClose = jest.fn();
  render(<UndoSnackbar open message="Merged" onClose={onClose} onUndo={() => {}} />);

  act(() => {
    jest.advanceTimersByTime(5000);
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});

test('respects a custom autoHideDuration', () => {
  const onClose = jest.fn();
  render(
    <UndoSnackbar open message="Merged" onClose={onClose} onUndo={() => {}} autoHideDuration={10000} />
  );

  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(onClose).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('reopening resets the countdown to 5 seconds', () => {
  const { rerender } = render(
    <UndoSnackbar open message="Merged" onClose={() => {}} autoHideDuration={60000} />
  );

  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.getByText(/Undo \(2s\)/)).toBeInTheDocument();

  rerender(<UndoSnackbar open={false} message="Merged" onClose={() => {}} autoHideDuration={60000} />);
  rerender(<UndoSnackbar open message="Merged" onClose={() => {}} autoHideDuration={60000} />);

  expect(screen.getByText(/Undo \(5s\)/)).toBeInTheDocument();
});
