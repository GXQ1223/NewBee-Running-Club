import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ClubEntryRules from './ClubEntryRules';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import {
  getClubRuleVersions,
  createClubRuleVersion,
  updateClubRuleVersion,
  deleteClubRuleVersion,
} from '../api/clubRules';

// The custom transformIgnorePatterns in package.json prevents CRA's CSS
// transform from handling node_modules CSS, so stub the quill stylesheet.
jest.mock('react-quill/dist/quill.snow.css', () => ({}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));
jest.mock('../api/clubRules', () => ({
  getClubRuleVersions: jest.fn(),
  createClubRuleVersion: jest.fn(),
  updateClubRuleVersion: jest.fn(),
  deleteClubRuleVersion: jest.fn(),
}));

const v2026 = {
  id: 101,
  year_label: '2026',
  title: '2026 年赛事规则',
  content: '<p>Rules for 2026</p>',
  is_current: true,
  updated_at: '2026-01-05T12:00:00Z',
  created_by: 'Alice',
};
const v2025 = {
  id: 100,
  year_label: '2025',
  title: '2025 年赛事规则',
  content: '<p>Rules for 2025</p>',
  is_current: false,
  updated_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'uid-1' } });
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  getClubRuleVersions.mockResolvedValue([v2026, v2025]);
});

describe('fallback content', () => {
  test('shows the built-in 2025 rules when the API returns no versions', async () => {
    getClubRuleVersions.mockResolvedValue([]);
    render(<ClubEntryRules />);
    await waitFor(() => expect(getClubRuleVersions).toHaveBeenCalled());
    expect(screen.getByText('2025 年赛事规则')).toBeInTheDocument();
    expect(screen.getByText('Current 现行')).toBeInTheDocument();
    expect(screen.getByText('无需抽签、直接参赛')).toBeVisible();
  });

  test('keeps the fallback content when the API errors', async () => {
    getClubRuleVersions.mockRejectedValue(new Error('down'));
    render(<ClubEntryRules />);
    await waitFor(() => expect(getClubRuleVersions).toHaveBeenCalled());
    expect(screen.getByText('2025 年赛事规则')).toBeInTheDocument();
    expect(screen.getByText('Current 现行')).toBeInTheDocument();
  });
});

describe('API revisions accordion', () => {
  test('renders rows current-first with Current/Archived pills and metadata', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    const titles = screen
      .getAllByText(/年赛事规则$/)
      .map((el) => el.textContent.trim().split('Club Entry Rules')[0].trim());
    expect(titles).toEqual(['2026 年赛事规则', '2025 年赛事规则']);
    expect(screen.getByText('Current 现行')).toBeInTheDocument();
    expect(screen.getByText('Archived 存档')).toBeInTheDocument();
    expect(screen.getByText(/Updated .*· Alice/)).toBeInTheDocument();
  });

  test('expands the current version by default; archived is collapsed', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');
    expect(screen.getByText('Rules for 2026')).toBeVisible();
    expect(screen.getByText('Rules for 2025')).not.toBeVisible();
  });

  test('clicking a collapsed row expands it and collapses the other; clicking again collapses', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('2025 年赛事规则'));
    expect(screen.getByText('Rules for 2025')).toBeVisible();
    await waitFor(() => expect(screen.getByText('Rules for 2026')).not.toBeVisible());

    fireEvent.click(screen.getByText('2025 年赛事规则'));
    await waitFor(() => expect(screen.getByText('Rules for 2025')).not.toBeVisible());
  });

  test('hides admin affordances outside admin mode', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');
    expect(screen.queryByText('New Revision 新版本')).not.toBeInTheDocument();
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
  });
});

describe('admin editing', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('New Revision prefills year/title and content from the latest version, then creates', async () => {
    createClubRuleVersion.mockResolvedValue({});
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('New Revision 新版本'));
    expect(screen.getByText('New Revision / 新版本')).toBeInTheDocument();

    const year = String(new Date().getFullYear());
    expect(screen.getByLabelText(/Year/)).toHaveValue(year);
    expect(screen.getByLabelText(/Title/)).toHaveValue(`${year} 年赛事规则`);
    // Prefilled from the latest revision (versions[0])
    expect(screen.getByTestId('quill-editor')).toHaveValue('<p>Rules for 2026</p>');
    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.change(screen.getByTestId('quill-editor'), {
      target: { value: '<p>Revised rules</p>' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    await waitFor(() =>
      expect(createClubRuleVersion).toHaveBeenCalledWith(
        {
          year_label: year,
          title: `${year} 年赛事规则`,
          content: '<p>Revised rules</p>',
          is_current: true,
        },
        'uid-1'
      )
    );
    expect(await screen.findByText('Rules saved / 规则已保存')).toBeInTheDocument();
    // Reloads versions after saving
    expect(getClubRuleVersions).toHaveBeenCalledTimes(2);
    expect(updateClubRuleVersion).not.toHaveBeenCalled();
  });

  test('edit dialog prefills the selected version and updates it', async () => {
    updateClubRuleVersion.mockResolvedValue({});
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    // One edit icon per row; first row is the current 2026 version
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    expect(screen.getByText('Edit Revision / 编辑版本')).toBeInTheDocument();
    expect(screen.getByLabelText(/Year/)).toHaveValue('2026');

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: '2026 年赛事规则（修订）' },
    });
    fireEvent.click(screen.getByRole('checkbox')); // un-set is_current
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    await waitFor(() =>
      expect(updateClubRuleVersion).toHaveBeenCalledWith(
        101,
        {
          year_label: '2026',
          title: '2026 年赛事规则（修订）',
          content: '<p>Rules for 2026</p>',
          is_current: false,
        },
        'uid-1'
      )
    );
  });

  test('save is disabled when required fields are empty', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');
    fireEvent.click(screen.getByText('New Revision 新版本'));

    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: '2027' } });
    fireEvent.change(screen.getByTestId('quill-editor'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('shows an error snackbar when saving fails and keeps the dialog open', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createClubRuleVersion.mockRejectedValue(new Error('save failed'));
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('New Revision 新版本'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });

    expect(await screen.findByText('Failed to save rules / 保存规则失败')).toBeInTheDocument();
    expect(screen.getByText('New Revision / 新版本')).toBeInTheDocument();
    errSpy.mockRestore();
  });

  test('save does nothing when there is no signed-in user', async () => {
    useAuth.mockReturnValue({ currentUser: null });
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('New Revision 新版本'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(createClubRuleVersion).not.toHaveBeenCalled();
  });

  test('delete asks for confirmation and deletes the revision', async () => {
    window.confirm = jest.fn(() => true);
    deleteClubRuleVersion.mockResolvedValue({});
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    });

    expect(window.confirm).toHaveBeenCalledWith(
      'Delete "2026 年赛事规则"? / 确认删除该版本？'
    );
    await waitFor(() => expect(deleteClubRuleVersion).toHaveBeenCalledWith(101, 'uid-1'));
    expect(await screen.findByText('Revision deleted / 版本已删除')).toBeInTheDocument();
  });

  test('cancelling the confirm dialog aborts the delete', async () => {
    window.confirm = jest.fn(() => false);
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    });
    expect(deleteClubRuleVersion).not.toHaveBeenCalled();
  });

  test('shows an error snackbar when deleting fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.confirm = jest.fn(() => true);
    deleteClubRuleVersion.mockRejectedValue(new Error('nope'));
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    });

    expect(await screen.findByText('Failed to delete / 删除失败')).toBeInTheDocument();
    errSpy.mockRestore();
  });

  test('cancel closes the dialog without saving', async () => {
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('New Revision 新版本'));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() =>
      expect(screen.queryByText('New Revision / 新版本')).not.toBeInTheDocument()
    );
    expect(createClubRuleVersion).not.toHaveBeenCalled();
  });

  test('snackbar can be dismissed', async () => {
    createClubRuleVersion.mockResolvedValue({});
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    fireEvent.click(screen.getByText('New Revision 新版本'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    const alert = await screen.findByText('Rules saved / 规则已保存');
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() => expect(alert).not.toBeInTheDocument());
  });

  test('snackbar dismisses on clickaway and the dialog closes on escape', async () => {
    createClubRuleVersion.mockResolvedValue({});
    render(<ClubEntryRules />);
    await screen.findByText('2026 年赛事规则');

    // Escape closes the dialog through its onClose handler
    fireEvent.click(screen.getByText('New Revision 新版本'));
    fireEvent.keyDown(screen.getByText('New Revision / 新版本'), { key: 'Escape', code: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('New Revision / 新版本')).not.toBeInTheDocument()
    );

    // Save again so the snackbar shows, then dismiss it via clickaway
    fireEvent.click(screen.getByText('New Revision 新版本'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    const alert = await screen.findByText('Rules saved / 规则已保存');
    // ClickAwayListener only arms itself after a macrotask, so wait one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(document.body);
    await waitFor(() => expect(alert).not.toBeInTheDocument());
  });
});
