import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import DonationHeroCard from './DonationHeroCard';

const mockWriteText = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteText.mockResolvedValue();
  Object.assign(navigator, {
    clipboard: { writeText: mockWriteText },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DonationHeroCard', () => {
  test('renders title, both payment methods, and the acknowledgement letter footer', () => {
    render(<DonationHeroCard />);
    expect(screen.getByText(/Support NewBee/)).toBeInTheDocument();
    expect(screen.getByText('支持新蜂跑团')).toBeInTheDocument();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
    expect(screen.getByText('Venmo')).toBeInTheDocument();
    expect(screen.getByText('newbeerunningclub@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('@NewBee-Running')).toBeInTheDocument();
    expect(screen.getByText(/Donation Acknowledgement/)).toBeInTheDocument();
  });

  test('shows the Zelle and Venmo QR images', () => {
    render(<DonationHeroCard />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', '/images/zelle-qr.png');
    expect(images[0]).toHaveAttribute('alt', 'Zelle QR code for NewBee Running Inc.');
    expect(images[1]).toHaveAttribute('src', '/images/venmo-qr.png');
    expect(images[1]).toHaveAttribute('alt', 'Venmo QR code for @NewBee-Running');
  });

  test('links to the Venmo profile in a new tab', () => {
    render(<DonationHeroCard />);
    const link = screen.getByRole('link', { name: /Open in Venmo/ });
    expect(link).toHaveAttribute('href', 'https://venmo.com/u/NewBee-Running');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('copies the Zelle email and shows a temporary confirmation', async () => {
    jest.useFakeTimers();
    render(<DonationHeroCard />);
    const copyButtons = screen.getAllByRole('button', { name: 'Copy 复制' });
    expect(copyButtons).toHaveLength(2);

    fireEvent.click(copyButtons[0]);
    expect(mockWriteText).toHaveBeenCalledWith('newbeerunningclub@gmail.com');
    await act(async () => {}); // flush the clipboard promise
    expect(screen.getByText('✓ Copied 已复制')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.queryByText('✓ Copied 已复制')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy 复制' })).toHaveLength(2);
  });

  test('copies the Venmo handle, resetting the timer on repeated clicks', async () => {
    jest.useFakeTimers();
    render(<DonationHeroCard />);
    const copyButtons = screen.getAllByRole('button', { name: 'Copy 复制' });

    fireEvent.click(copyButtons[1]);
    expect(mockWriteText).toHaveBeenCalledWith('@NewBee-Running');
    await act(async () => {}); // flush the clipboard promise so the reset timer is scheduled
    expect(screen.getByText('✓ Copied 已复制')).toBeInTheDocument();

    // A second click before the timeout restarts the countdown
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByText('✓ Copied 已复制'));
    await act(async () => {}); // flush again so the old timer is cleared and a new one starts
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // 4s after the first click, but only 2s after the second — still showing
    expect(screen.getByText('✓ Copied 已复制')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByText('✓ Copied 已复制')).not.toBeInTheDocument();
  });

  test('keeps the Copy label and logs when the clipboard write fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockWriteText.mockRejectedValue(new Error('denied'));
    render(<DonationHeroCard />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy 复制' })[0]);
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Copy failed:', expect.any(Error));
    });
    expect(screen.queryByText('✓ Copied 已复制')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
