import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminModerationPanel from './AdminModerationPanel';
import { useAuth } from '../context/AuthContext';
import { updateEventSettings } from '../api';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api', () => ({ updateEventSettings: jest.fn() }));

const SETTINGS = {
  comments_enabled: true,
  likes_enabled: true,
  reactions_enabled: false,
};

function expandPanel() {
  fireEvent.click(screen.getByText('Admin Controls'));
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
});

describe('AdminModerationPanel', () => {
  test('renders collapsed header and expands to show switches with current state', () => {
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expect(screen.getByText('Admin Controls')).toBeInTheDocument();

    expandPanel();
    expect(screen.getByText('Comments Enabled')).toBeInTheDocument();
    expect(screen.getByText('Likes Enabled')).toBeInTheDocument();
    expect(screen.getByText('Reactions Disabled')).toBeInTheDocument();

    const switches = screen.getAllByRole('checkbox');
    expect(switches[0]).toBeChecked();
    expect(switches[1]).toBeChecked();
    expect(switches[2]).not.toBeChecked();
  });

  test('collapse toggles back with the expand icon state', () => {
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expandPanel();
    expect(screen.getByTestId('ExpandLessIcon')).toBeInTheDocument();
    expandPanel();
    expect(screen.getByTestId('ExpandMoreIcon')).toBeInTheDocument();
  });

  test('toggling comments calls API and applies returned settings + onSettingsUpdate', async () => {
    updateEventSettings.mockResolvedValue({
      comments_enabled: false,
      likes_enabled: true,
      reactions_enabled: false,
      unrelated: 'ignored',
    });
    const onSettingsUpdate = jest.fn();
    render(
      <AdminModerationPanel eventId={7} settings={SETTINGS} onSettingsUpdate={onSettingsUpdate} />
    );
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    await waitFor(() => expect(screen.getByText('Comments Disabled')).toBeInTheDocument());
    expect(updateEventSettings).toHaveBeenCalledWith(7, { comments_enabled: false }, 'admin-1');
    expect(onSettingsUpdate).toHaveBeenCalledWith({
      comments_enabled: false,
      likes_enabled: true,
      reactions_enabled: false,
    });
  });

  test('toggling a disabled setting sends the enabled value', async () => {
    updateEventSettings.mockResolvedValue({
      comments_enabled: true,
      likes_enabled: true,
      reactions_enabled: true,
    });
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[2]);

    await waitFor(() => expect(screen.getByText('Reactions Enabled')).toBeInTheDocument());
    expect(updateEventSettings).toHaveBeenCalledWith(7, { reactions_enabled: true }, 'admin-1');
  });

  test('works without onSettingsUpdate callback', async () => {
    updateEventSettings.mockResolvedValue({
      comments_enabled: true,
      likes_enabled: false,
      reactions_enabled: false,
    });
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    await waitFor(() => expect(screen.getByText('Likes Disabled')).toBeInTheDocument());
    expect(updateEventSettings).toHaveBeenCalledWith(7, { likes_enabled: false }, 'admin-1');
  });

  test('switches are disabled while an update is in flight', async () => {
    let resolveUpdate;
    updateEventSettings.mockReturnValue(new Promise((res) => { resolveUpdate = res; }));
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    screen.getAllByRole('checkbox').forEach((sw) => expect(sw).toBeDisabled());

    resolveUpdate({ comments_enabled: false, likes_enabled: true, reactions_enabled: false });
    await waitFor(() =>
      screen.getAllByRole('checkbox').forEach((sw) => expect(sw).not.toBeDisabled())
    );
  });

  test('shows a dismissible error alert when update fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    updateEventSettings.mockRejectedValue(new Error('boom'));
    render(<AdminModerationPanel eventId={7} settings={SETTINGS} />);
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(await screen.findByText('Failed to update settings')).toBeInTheDocument();
    // Local settings unchanged on failure
    expect(screen.getByText('Comments Enabled')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Failed to update settings')).not.toBeInTheDocument()
    );
    consoleSpy.mockRestore();
  });

  test('uses undefined uid when no user is logged in', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    updateEventSettings.mockResolvedValue({
      comments_enabled: false,
      likes_enabled: true,
      reactions_enabled: false,
    });
    render(<AdminModerationPanel eventId={9} settings={SETTINGS} />);
    expandPanel();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    await waitFor(() =>
      expect(updateEventSettings).toHaveBeenCalledWith(9, { comments_enabled: false }, undefined)
    );
  });
});
