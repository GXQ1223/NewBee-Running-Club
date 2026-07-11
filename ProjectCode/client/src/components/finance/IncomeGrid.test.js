import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import IncomeGrid, { methodFromSource } from './IncomeGrid';
import { useAuth } from '../../context';
import {
  getIncome, getFinanceCategories, classifyIncome, addManualIncome,
} from '../../api/finance';

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../api/finance', () => ({
  getIncome: jest.fn(),
  getFinanceCategories: jest.fn(),
  classifyIncome: jest.fn(),
  addManualIncome: jest.fn(),
}));

const currentYear = new Date().getFullYear();

const incomeRows = [
  {
    donation_id: 1,
    name: 'connie zhou',
    amount: '20.00',
    donation_date: `${currentYear}-07-08`,
    source: 'Venmo (connie zhou)',
    message: 'carpool bear mountain - 岑岑',
    income_type: null,
    event_code: null,
    thank_you_sent_at: null,
  },
  {
    donation_id: 2,
    name: 'Kevin Gu',
    amount: '15.00',
    donation_date: `${currentYear}-07-06`,
    source: 'Venmo (Kevin Gu)',
    message: '🍉 梅老板加油',
    income_type: 'donation',
    event_code: 1001,
    thank_you_sent_at: `${currentYear}-07-11T09:00:00`,
  },
  {
    donation_id: 3,
    name: 'Ryan Young',
    amount: '20.00',
    donation_date: `${currentYear}-07-08`,
    source: 'Zelle (Ryan Young)',
    message: '拼车费用',
    income_type: 'pass_through',
    event_code: 1002,
    thank_you_sent_at: null,
  },
];

const categories = {
  events: [
    { id: 1, kind: 'event', code: 1001, name: 'General', is_active: true },
    { id: 2, kind: 'event', code: 1002, name: 'Bear Mt. Run', is_active: true },
    { id: 3, kind: 'event', code: 1003, name: 'Old Gala', is_active: false },
  ],
  income_types: [],
  expenses: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getIncome.mockResolvedValue(incomeRows);
  getFinanceCategories.mockResolvedValue(categories);
  classifyIncome.mockResolvedValue({ updated: 1 });
  addManualIncome.mockResolvedValue({});
});

test('derives the method by stripping the parenthetical from the source', () => {
  expect(methodFromSource('Zelle (Li Chen)')).toBe('Zelle');
  expect(methodFromSource('Venmo (connie zhou)')).toBe('Venmo');
  expect(methodFromSource('Manual')).toBe('Manual');
  expect(methodFromSource(null)).toBe('');
});

test('renders rows with amounts, methods, memos and classification chips', async () => {
  render(<IncomeGrid />);
  expect(await screen.findByText('connie zhou')).toBeInTheDocument();
  expect(screen.getAllByText('$20.00')).toHaveLength(2);
  expect(screen.getByText('$15.00')).toBeInTheDocument();
  expect(screen.getAllByText('Venmo').length).toBe(2);
  expect(screen.getByText('Zelle')).toBeInTheDocument();
  expect(screen.getByText('carpool bear mountain - 岑岑')).toBeInTheDocument();
  // Chips: classified rows show type + event, unclassified shows the dashed prompts
  expect(screen.getByText('Donation 捐款 ▾')).toBeInTheDocument();
  expect(screen.getByText('Pass-through 代收 ▾')).toBeInTheDocument();
  expect(screen.getByText('General ▾')).toBeInTheDocument();
  expect(screen.getByText('Bear Mt. Run ▾')).toBeInTheDocument();
  expect(screen.getByText('＋ classify 分类')).toBeInTheDocument();
  expect(screen.getByText('＋ event')).toBeInTheDocument();
});

test('ack column shows the sent date for donations and a dash for non-donations', async () => {
  render(<IncomeGrid />);
  await screen.findByText('Kevin Gu');
  expect(screen.getByText('✓ Jul 11')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument(); // pass-through row
});

test('filter chips narrow the grid', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');

  fireEvent.click(screen.getByText('Unclassified 未分类'));
  expect(screen.getByText('connie zhou')).toBeInTheDocument();
  expect(screen.queryByText('Kevin Gu')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('Donation 捐款'));
  expect(screen.getByText('Kevin Gu')).toBeInTheDocument();
  expect(screen.queryByText('connie zhou')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('Pass-through 代收'));
  expect(screen.getByText('Ryan Young')).toBeInTheDocument();
  expect(screen.queryByText('Kevin Gu')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('All 全部'));
  expect(screen.getByText('connie zhou')).toBeInTheDocument();
});

test('classifies a single row from the type chip menu', async () => {
  const onChanged = jest.fn();
  render(<IncomeGrid onChanged={onChanged} />);
  await screen.findByText('connie zhou');

  fireEvent.click(screen.getByText('＋ classify 分类'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('Event Revenue 活动收入'));

  await waitFor(() => expect(classifyIncome).toHaveBeenCalledWith(
    { donation_ids: [1], income_type: 'event_revenue' }, 'admin-uid'
  ));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(getIncome).toHaveBeenCalledTimes(2); // refetched after classify
});

test('changes the event of a classified row, keeping its income type', async () => {
  render(<IncomeGrid />);
  await screen.findByText('Ryan Young');

  fireEvent.click(screen.getByText('Bear Mt. Run ▾'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('General'));

  await waitFor(() => expect(classifyIncome).toHaveBeenCalledWith(
    { donation_ids: [3], income_type: 'pass_through', event_code: 1001 }, 'admin-uid'
  ));
});

test('setting the event of an unclassified row defaults it to a donation', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');

  fireEvent.click(screen.getByText('＋ event'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('Bear Mt. Run'));

  await waitFor(() => expect(classifyIncome).toHaveBeenCalledWith(
    { donation_ids: [1], income_type: 'donation', event_code: 1002 }, 'admin-uid'
  ));
});

test('inactive events are hidden from the event menu', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByText('＋ event'));
  const menu = await screen.findByRole('menu');
  expect(within(menu).queryByText('Old Gala')).not.toBeInTheDocument();
});

test('bulk classify bar applies a type and event to the checked rows', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');

  fireEvent.click(screen.getByLabelText('Select row 1'));
  fireEvent.click(screen.getByLabelText('Select row 3'));
  expect(screen.getByText(/2 rows selected 已选 2 行/)).toBeInTheDocument();

  fireEvent.mouseDown(screen.getByLabelText('Bulk type 批量属性').closest('[role="combobox"]') || screen.getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByRole('option', { name: 'Pass-through 代收' }));

  fireEvent.mouseDown(screen.getByLabelText('Bulk event 批量活动').closest('[role="combobox"]') || screen.getAllByRole('combobox')[1]);
  fireEvent.click(await screen.findByRole('option', { name: 'Bear Mt. Run' }));

  fireEvent.click(screen.getByText('Apply 应用'));
  await waitFor(() => expect(classifyIncome).toHaveBeenCalledWith(
    { donation_ids: [1, 3], income_type: 'pass_through', event_code: 1002 }, 'admin-uid'
  ));
  // Selection clears afterwards
  await waitFor(() => expect(screen.queryByText(/rows selected/)).not.toBeInTheDocument());
});

test('bulk apply without an event omits event_code', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByLabelText('Select row 1'));
  fireEvent.click(screen.getByText('Apply 应用'));
  await waitFor(() => expect(classifyIncome).toHaveBeenCalledWith(
    { donation_ids: [1], income_type: 'donation' }, 'admin-uid'
  ));
});

test('the header checkbox selects and clears every visible row', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByLabelText('Select all rows 全选'));
  expect(screen.getByText(/3 rows selected 已选 3 行/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Select all rows 全选'));
  await waitFor(() => expect(screen.queryByText(/rows selected/)).not.toBeInTheDocument());
});

test('the Clear button empties the selection', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByLabelText('Select row 1'));
  fireEvent.click(screen.getByText('Clear 清除'));
  await waitFor(() => expect(screen.queryByText(/rows selected/)).not.toBeInTheDocument());
});

test('adds a manual income row through the dialog', async () => {
  const onChanged = jest.fn();
  render(<IncomeGrid onChanged={onChanged} />);
  await screen.findByText('connie zhou');

  fireEvent.click(screen.getByText('＋ Manual row 手动记一笔'));
  expect(await screen.findByLabelText('From 来自')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('From 来自'), { target: { value: 'Cash box' } });
  fireEvent.change(screen.getByLabelText('Amount 金额 $'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Date 日期'), { target: { value: '2026-07-01' } });
  fireEvent.change(screen.getByLabelText('Method 方式'), { target: { value: 'Cash' } });
  fireEvent.change(screen.getByLabelText('Memo 备注'), { target: { value: 'bake sale' } });

  fireEvent.mouseDown(screen.getByLabelText('Type 属性').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'Event Revenue 活动收入' }));
  fireEvent.mouseDown(screen.getByLabelText('Event 活动').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'Bear Mt. Run' }));

  fireEvent.click(screen.getByText('Save 保存'));
  await waitFor(() => expect(addManualIncome).toHaveBeenCalledWith({
    name: 'Cash box',
    amount: 40,
    donation_date: '2026-07-01',
    method: 'Cash',
    memo: 'bake sale',
    income_type: 'event_revenue',
    event_code: 1002,
  }, 'admin-uid'));
  await waitFor(() => expect(screen.queryByLabelText('From 来自')).not.toBeInTheDocument());
  expect(onChanged).toHaveBeenCalled();
});

test('manual dialog save stays disabled without a name and positive amount', async () => {
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByText('＋ Manual row 手动记一笔'));
  const save = await screen.findByText('Save 保存');
  expect(save.closest('button')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('From 来自'), { target: { value: 'X' } });
  expect(save.closest('button')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Amount 金额 $'), { target: { value: '5' } });
  expect(save.closest('button')).not.toBeDisabled();
  fireEvent.click(screen.getByText('Cancel 取消'));
  await waitFor(() => expect(screen.queryByLabelText('From 来自')).not.toBeInTheDocument());
});

test('shows an error when the manual row cannot be saved', async () => {
  addManualIncome.mockRejectedValue(new Error('400'));
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByText('＋ Manual row 手动记一笔'));
  fireEvent.change(await screen.findByLabelText('From 来自'), { target: { value: 'X' } });
  fireEvent.change(screen.getByLabelText('Amount 金额 $'), { target: { value: '5' } });
  fireEvent.click(screen.getByText('Save 保存'));
  expect(await screen.findByText(/手动记账失败/)).toBeInTheDocument();
});

test('shows an error when loading fails', async () => {
  getIncome.mockRejectedValue(new Error('500'));
  render(<IncomeGrid />);
  expect(await screen.findByText(/Failed to load income rows/)).toBeInTheDocument();
});

test('shows an error when classification fails', async () => {
  classifyIncome.mockRejectedValue(new Error('403'));
  render(<IncomeGrid />);
  await screen.findByText('connie zhou');
  fireEvent.click(screen.getByText('＋ classify 分类'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('Donation 捐款'));
  expect(await screen.findByText(/分类失败/)).toBeInTheDocument();
});

test('shows an empty state when the filter matches nothing', async () => {
  getIncome.mockResolvedValue([]);
  render(<IncomeGrid />);
  expect(await screen.findByText(/暂无收入记录/)).toBeInTheDocument();
});

test('fetches nothing without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<IncomeGrid />);
  expect(getIncome).not.toHaveBeenCalled();
});

test('refetches when refreshKey changes', async () => {
  const { rerender } = render(<IncomeGrid refreshKey={0} />);
  await screen.findByText('connie zhou');
  expect(getIncome).toHaveBeenCalledTimes(1);
  rerender(<IncomeGrid refreshKey={1} />);
  await waitFor(() => expect(getIncome).toHaveBeenCalledTimes(2));
});
