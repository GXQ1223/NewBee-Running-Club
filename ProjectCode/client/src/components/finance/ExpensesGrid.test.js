import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ExpensesGrid from './ExpensesGrid';
import { useAuth } from '../../context';
import {
  getExpenses, getFinanceCategories, classifyExpenses, deleteExpense,
} from '../../api/finance';

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../api/finance', () => ({
  getExpenses: jest.fn(),
  getFinanceCategories: jest.fn(),
  classifyExpenses: jest.fn(),
  deleteExpense: jest.fn(),
}));

const currentYear = new Date().getFullYear();

const expenseRows = [
  {
    id: 1,
    expense_date: `${currentYear}-07-02`,
    vendor: 'NYRR',
    amount: '120.00',
    method: 'Card',
    bank_description: 'NYRR RACE FEE 0234',
    event_code: null,
    expense_category_code: null,
  },
  {
    id: 2,
    expense_date: `${currentYear}-06-20`,
    vendor: 'Costco',
    amount: '80.50',
    method: 'Card',
    bank_description: 'COSTCO WHSE #344',
    event_code: 1002,
    expense_category_code: 201,
  },
];

const categories = {
  events: [
    { id: 1, kind: 'event', code: 1001, name: 'General', is_active: true },
    { id: 2, kind: 'event', code: 1002, name: 'Bear Mt. Run', is_active: true },
  ],
  income_types: [],
  expenses: [
    { id: 9, kind: 'expense', code: 201, name: 'Supplies 物资', is_active: true },
    { id: 10, kind: 'expense', code: 202, name: 'Race fees 报名费', is_active: true },
    { id: 11, kind: 'expense', code: 203, name: 'Retired', is_active: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getExpenses.mockResolvedValue(expenseRows);
  getFinanceCategories.mockResolvedValue(categories);
  classifyExpenses.mockResolvedValue({ updated: 1 });
  deleteExpense.mockResolvedValue({});
});

test('renders expenses with negative red amounts, descriptions and chips', async () => {
  render(<ExpensesGrid />);
  expect(await screen.findByText('NYRR')).toBeInTheDocument();
  expect(screen.getByText('-$120.00')).toBeInTheDocument();
  expect(screen.getByText('-$80.50')).toBeInTheDocument();
  expect(screen.getByText('NYRR RACE FEE 0234')).toBeInTheDocument();
  expect(screen.getByText('Bear Mt. Run ▾')).toBeInTheDocument();
  expect(screen.getByText('Supplies 物资 ▾')).toBeInTheDocument();
  expect(screen.getByText('＋ event')).toBeInTheDocument();
  expect(screen.getByText('＋ category 类别')).toBeInTheDocument();
  // Import hint banner
  expect(screen.getByText(/duplicates are skipped automatically/)).toBeInTheDocument();
});

test('classifies a single expense to an event from the chip menu', async () => {
  const onChanged = jest.fn();
  render(<ExpensesGrid onChanged={onChanged} />);
  await screen.findByText('NYRR');

  fireEvent.click(screen.getByText('＋ event'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('Bear Mt. Run'));

  await waitFor(() => expect(classifyExpenses).toHaveBeenCalledWith(
    { expense_ids: [1], event_code: 1002 }, 'admin-uid'
  ));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(getExpenses).toHaveBeenCalledTimes(2);
});

test('classifies a single expense to a category from the chip menu', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');

  fireEvent.click(screen.getByText('＋ category 类别'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('Race fees 报名费'));

  await waitFor(() => expect(classifyExpenses).toHaveBeenCalledWith(
    { expense_ids: [1], expense_category_code: 202 }, 'admin-uid'
  ));
});

test('inactive expense categories are hidden from the menu', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByText('＋ category 类别'));
  const menu = await screen.findByRole('menu');
  expect(within(menu).queryByText('Retired')).not.toBeInTheDocument();
});

test('bulk bar applies event and category to the checked rows', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');

  fireEvent.click(screen.getByLabelText('Select expense 1'));
  fireEvent.click(screen.getByLabelText('Select expense 2'));
  expect(screen.getByText(/2 rows selected 已选 2 行/)).toBeInTheDocument();

  fireEvent.mouseDown(screen.getByLabelText('Bulk event 批量活动').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'General' }));

  fireEvent.mouseDown(screen.getByLabelText('Bulk category 批量类别').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'Supplies 物资' }));

  fireEvent.click(screen.getByText('Apply 应用'));
  await waitFor(() => expect(classifyExpenses).toHaveBeenCalledWith(
    { expense_ids: [1, 2], event_code: 1001, expense_category_code: 201 }, 'admin-uid'
  ));
  await waitFor(() => expect(screen.queryByText(/rows selected/)).not.toBeInTheDocument());
});

test('bulk Apply stays disabled until an event or category is chosen', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByLabelText('Select expense 1'));
  expect(screen.getByText('Apply 应用').closest('button')).toBeDisabled();
  fireEvent.mouseDown(screen.getByLabelText('Bulk event 批量活动').closest('[role="combobox"]'));
  fireEvent.click(await screen.findByRole('option', { name: 'General' }));
  expect(screen.getByText('Apply 应用').closest('button')).not.toBeDisabled();
});

test('the header checkbox selects every row and Clear empties it', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByLabelText('Select all expenses 全选'));
  expect(screen.getByText(/2 rows selected/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Clear 清除'));
  await waitFor(() => expect(screen.queryByText(/rows selected/)).not.toBeInTheDocument());
});

test('deletes an expense after the confirm dialog', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');

  fireEvent.click(screen.getByLabelText('Delete expense 1'));
  expect(await screen.findByText('Delete expense 删除支出?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Delete 删除'));

  await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith(1, 'admin-uid'));
  await waitFor(() => expect(screen.queryByText('Delete expense 删除支出?')).not.toBeInTheDocument());
  expect(getExpenses).toHaveBeenCalledTimes(2);
});

test('cancelling the confirm dialog deletes nothing', async () => {
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByLabelText('Delete expense 1'));
  fireEvent.click(await screen.findByText('Cancel 取消'));
  await waitFor(() => expect(screen.queryByText('Delete expense 删除支出?')).not.toBeInTheDocument());
  expect(deleteExpense).not.toHaveBeenCalled();
});

test('shows an error when deleting fails', async () => {
  deleteExpense.mockRejectedValue(new Error('500'));
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByLabelText('Delete expense 1'));
  fireEvent.click(await screen.findByText('Delete 删除'));
  expect(await screen.findByText(/删除支出失败/)).toBeInTheDocument();
});

test('shows an error when classification fails', async () => {
  classifyExpenses.mockRejectedValue(new Error('403'));
  render(<ExpensesGrid />);
  await screen.findByText('NYRR');
  fireEvent.click(screen.getByText('＋ event'));
  const menu = await screen.findByRole('menu');
  fireEvent.click(within(menu).getByText('General'));
  expect(await screen.findByText(/分类失败/)).toBeInTheDocument();
});

test('shows an error when loading fails', async () => {
  getExpenses.mockRejectedValue(new Error('500'));
  render(<ExpensesGrid />);
  expect(await screen.findByText(/加载支出记录失败/)).toBeInTheDocument();
});

test('shows an empty state before any import', async () => {
  getExpenses.mockResolvedValue([]);
  render(<ExpensesGrid />);
  expect(await screen.findByText(/暂无支出，请先导入账单/)).toBeInTheDocument();
});

test('fetches nothing without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<ExpensesGrid />);
  expect(getExpenses).not.toHaveBeenCalled();
});

test('refetches when refreshKey changes', async () => {
  const { rerender } = render(<ExpensesGrid refreshKey={0} />);
  await screen.findByText('NYRR');
  rerender(<ExpensesGrid refreshKey={1} />);
  await waitFor(() => expect(getExpenses).toHaveBeenCalledTimes(2));
});
