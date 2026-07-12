import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FinanceSettingsTab from './FinanceSettingsTab';
import { useAuth } from '../../context';
import {
  getFinanceSettings, updateFinanceSettings, getFinanceCategories,
  createFinanceCategory, updateFinanceCategory,
} from '../../api/finance';

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../api/finance', () => ({
  getFinanceSettings: jest.fn(),
  updateFinanceSettings: jest.fn(),
  getFinanceCategories: jest.fn(),
  createFinanceCategory: jest.fn(),
  updateFinanceCategory: jest.fn(),
}));

const settings = { auto_ack_enabled: false, org_start: '2016-06-01', fye_month: 12 };

const categories = {
  events: [
    { id: 1, kind: 'event', code: 1001, name: 'General', is_active: true },
    { id: 2, kind: 'event', code: 1002, name: 'Bear Mt. Run', is_active: true },
  ],
  income_types: [
    { id: 5, kind: 'income_type', code: 1, name: 'Donation 捐款', is_active: true },
  ],
  expenses: [
    { id: 9, kind: 'expense', code: 201, name: 'Supplies 物资', is_active: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getFinanceSettings.mockResolvedValue(settings);
  getFinanceCategories.mockResolvedValue(categories);
  updateFinanceSettings.mockResolvedValue({});
  createFinanceCategory.mockResolvedValue({});
  updateFinanceCategory.mockResolvedValue({});
});

test('renders the auto-ack switch, 509 parameters and the three category lists', async () => {
  render(<FinanceSettingsTab />);
  expect(await screen.findByText('Auto-send acknowledgments weekly 每周自动致谢')).toBeInTheDocument();
  expect(screen.getByLabelText('Auto-send acknowledgments weekly 每周自动致谢')).not.toBeChecked();
  expect(screen.getByLabelText('Org start 组织成立日')).toHaveValue('2016-06-01');
  expect(screen.getByText('Events 活动')).toBeInTheDocument();
  expect(screen.getByText('Income types 收入属性')).toBeInTheDocument();
  expect(screen.getByText('Expense categories 支出类别')).toBeInTheDocument();
  expect(screen.getByText('General')).toBeInTheDocument();
  expect(screen.getByText('Donation 捐款')).toBeInTheDocument();
  expect(screen.getByText('Supplies 物资')).toBeInTheDocument();
  expect(screen.getByText('1001')).toBeInTheDocument(); // code chip
});

test('toggling the auto-ack switch saves the setting', async () => {
  render(<FinanceSettingsTab />);
  const toggle = await screen.findByLabelText('Auto-send acknowledgments weekly 每周自动致谢');
  fireEvent.click(toggle);
  await waitFor(() => expect(updateFinanceSettings).toHaveBeenCalledWith(
    { auto_ack_enabled: true }, 'admin-uid'
  ));
  await waitFor(() => expect(toggle).toBeChecked());
});

test('changing the org start date saves on blur', async () => {
  render(<FinanceSettingsTab />);
  const field = await screen.findByLabelText('Org start 组织成立日');
  fireEvent.change(field, { target: { value: '2016-01-15' } });
  fireEvent.blur(field);
  await waitFor(() => expect(updateFinanceSettings).toHaveBeenCalledWith(
    { org_start: '2016-01-15' }, 'admin-uid'
  ));
});

test('an unchanged org start date does not save on blur', async () => {
  render(<FinanceSettingsTab />);
  const field = await screen.findByLabelText('Org start 组织成立日');
  fireEvent.blur(field);
  await waitFor(() => expect(updateFinanceSettings).not.toHaveBeenCalled());
});

test('changing the fiscal year end month saves the setting', async () => {
  render(<FinanceSettingsTab />);
  await screen.findByText('Events 活动');
  fireEvent.mouseDown(screen.getByLabelText('Fiscal year end month 财年截止月').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'June' }));
  await waitFor(() => expect(updateFinanceSettings).toHaveBeenCalledWith(
    { fye_month: 6 }, 'admin-uid'
  ));
});

test('adds a category of the right kind', async () => {
  render(<FinanceSettingsTab />);
  await screen.findByText('Events 活动');

  const input = screen.getByLabelText('New Events 活动');
  fireEvent.change(input, { target: { value: 'Track Meet 田径赛' } });
  const addButtons = screen.getAllByText('＋ Add 添加');
  fireEvent.click(addButtons[0]);

  await waitFor(() => expect(createFinanceCategory).toHaveBeenCalledWith(
    { kind: 'event', name: 'Track Meet 田径赛' }, 'admin-uid'
  ));
  // Categories reload and the input clears
  await waitFor(() => expect(getFinanceCategories).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('New Events 活动')).toHaveValue('');
});

test('add buttons stay disabled while the name is blank', async () => {
  render(<FinanceSettingsTab />);
  await screen.findByText('Events 活动');
  screen.getAllByText('＋ Add 添加').forEach((b) => {
    expect(b.closest('button')).toBeDisabled();
  });
});

test('renames a category inline', async () => {
  render(<FinanceSettingsTab />);
  await screen.findByText('General');

  fireEvent.click(screen.getAllByText('✎ Rename 重命名')[0]);
  const field = screen.getByLabelText('Rename General');
  fireEvent.change(field, { target: { value: 'General Support' } });
  fireEvent.click(screen.getByText('Save 保存'));

  await waitFor(() => expect(updateFinanceCategory).toHaveBeenCalledWith(
    1, { name: 'General Support' }, 'admin-uid'
  ));
  await waitFor(() => expect(getFinanceCategories).toHaveBeenCalledTimes(2));
});

test('cancelling a rename leaves the category untouched', async () => {
  render(<FinanceSettingsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getAllByText('✎ Rename 重命名')[0]);
  fireEvent.click(screen.getByText('✕'));
  await waitFor(() => expect(screen.queryByLabelText('Rename General')).not.toBeInTheDocument());
  expect(updateFinanceCategory).not.toHaveBeenCalled();
});

test('shows an error when settings fail to save', async () => {
  updateFinanceSettings.mockRejectedValue(new Error('500'));
  render(<FinanceSettingsTab />);
  fireEvent.click(await screen.findByLabelText('Auto-send acknowledgments weekly 每周自动致谢'));
  expect(await screen.findByText(/保存设置失败/)).toBeInTheDocument();
});

test('shows an error when adding a category fails', async () => {
  createFinanceCategory.mockRejectedValue(new Error('409'));
  render(<FinanceSettingsTab />);
  await screen.findByText('Events 活动');
  fireEvent.change(screen.getByLabelText('New Events 活动'), { target: { value: 'Dup' } });
  fireEvent.click(screen.getAllByText('＋ Add 添加')[0]);
  expect(await screen.findByText(/添加类别失败/)).toBeInTheDocument();
});

test('shows an error when renaming fails', async () => {
  updateFinanceCategory.mockRejectedValue(new Error('500'));
  render(<FinanceSettingsTab />);
  await screen.findByText('General');
  fireEvent.click(screen.getAllByText('✎ Rename 重命名')[0]);
  fireEvent.change(screen.getByLabelText('Rename General'), { target: { value: 'X' } });
  fireEvent.click(screen.getByText('Save 保存'));
  expect(await screen.findByText(/重命名失败/)).toBeInTheDocument();
});

test('shows an error when loading fails', async () => {
  getFinanceSettings.mockRejectedValue(new Error('500'));
  render(<FinanceSettingsTab />);
  expect(await screen.findByText(/加载设置失败/)).toBeInTheDocument();
});

test('fetches nothing without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<FinanceSettingsTab />);
  expect(getFinanceSettings).not.toHaveBeenCalled();
});
