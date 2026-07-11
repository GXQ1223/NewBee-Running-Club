import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DirectoryTab from './DirectoryTab';
import { useAuth } from '../../context';
import { getDirectory, upsertDirectoryEntry, deleteDirectoryEntry } from '../../api/finance';

jest.mock('../../context', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../api/finance', () => ({
  getDirectory: jest.fn(),
  upsertDirectoryEntry: jest.fn(),
  deleteDirectoryEntry: jest.fn(),
}));

const entries = [
  { id: 1, name: 'Li Chen', email: 'li@example.com', is_insider: false },
  { id: 2, name: 'Brandon Li', email: 'brandon@example.com', is_insider: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  getDirectory.mockResolvedValue(entries);
  upsertDirectoryEntry.mockResolvedValue({});
  deleteDirectoryEntry.mockResolvedValue({});
});

test('renders directory rows with emails and insider checkboxes', async () => {
  render(<DirectoryTab />);
  expect(await screen.findByText('Li Chen')).toBeInTheDocument();
  expect(screen.getByText('Brandon Li')).toBeInTheDocument();
  expect(screen.getByLabelText('Email for Li Chen')).toHaveValue('li@example.com');
  expect(screen.getByLabelText('Insider for Li Chen')).not.toBeChecked();
  expect(screen.getByLabelText('Insider for Brandon Li')).toBeChecked();
});

test('editing an email reveals Save and upserts the entry', async () => {
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  expect(screen.queryByText('Save 保存')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Email for Li Chen'), {
    target: { value: 'lichen@newbee.org' },
  });
  fireEvent.click(await screen.findByText('Save 保存'));

  await waitFor(() => expect(upsertDirectoryEntry).toHaveBeenCalledWith(
    { name: 'Li Chen', email: 'lichen@newbee.org', is_insider: false }, 'admin-uid'
  ));
  // Reloads the list afterwards
  await waitFor(() => expect(getDirectory).toHaveBeenCalledTimes(2));
});

test('toggling the insider checkbox marks the row dirty and saves it', async () => {
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');

  fireEvent.click(screen.getByLabelText('Insider for Li Chen'));
  fireEvent.click(await screen.findByText('Save 保存'));

  await waitFor(() => expect(upsertDirectoryEntry).toHaveBeenCalledWith(
    { name: 'Li Chen', email: 'li@example.com', is_insider: true }, 'admin-uid'
  ));
});

test('reverting a draft hides the Save button again', async () => {
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  fireEvent.click(screen.getByLabelText('Insider for Li Chen'));
  expect(await screen.findByText('Save 保存')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Insider for Li Chen'));
  await waitFor(() => expect(screen.queryByText('Save 保存')).not.toBeInTheDocument());
});

test('adds a new entry through the add form', async () => {
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');

  const addButton = screen.getByText('＋ Add 添加');
  expect(addButton.closest('button')).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Name 姓名'), { target: { value: 'Yue Ma' } });
  fireEvent.change(screen.getByLabelText('Email 邮箱'), { target: { value: 'yue@example.com' } });
  fireEvent.click(screen.getByLabelText('New entry insider 内部人'));
  expect(addButton.closest('button')).not.toBeDisabled();
  fireEvent.click(addButton);

  await waitFor(() => expect(upsertDirectoryEntry).toHaveBeenCalledWith(
    { name: 'Yue Ma', email: 'yue@example.com', is_insider: true }, 'admin-uid'
  ));
  // Form resets after adding
  await waitFor(() => expect(screen.getByLabelText('Name 姓名')).toHaveValue(''));
});

test('deletes an entry', async () => {
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  fireEvent.click(screen.getByLabelText('Delete Li Chen'));
  await waitFor(() => expect(deleteDirectoryEntry).toHaveBeenCalledWith(1, 'admin-uid'));
  await waitFor(() => expect(getDirectory).toHaveBeenCalledTimes(2));
});

test('shows an error when deleting fails', async () => {
  deleteDirectoryEntry.mockRejectedValue(new Error('500'));
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  fireEvent.click(screen.getByLabelText('Delete Li Chen'));
  expect(await screen.findByText(/删除失败/)).toBeInTheDocument();
});

test('shows an error when saving fails', async () => {
  upsertDirectoryEntry.mockRejectedValue(new Error('422'));
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  fireEvent.click(screen.getByLabelText('Insider for Li Chen'));
  fireEvent.click(await screen.findByText('Save 保存'));
  expect(await screen.findByText(/保存通讯录失败/)).toBeInTheDocument();
});

test('shows an error when adding fails', async () => {
  upsertDirectoryEntry.mockRejectedValue(new Error('422'));
  render(<DirectoryTab />);
  await screen.findByText('Li Chen');
  fireEvent.change(screen.getByLabelText('Name 姓名'), { target: { value: 'X' } });
  fireEvent.change(screen.getByLabelText('Email 邮箱'), { target: { value: 'x@y.com' } });
  fireEvent.click(screen.getByText('＋ Add 添加'));
  expect(await screen.findByText(/添加失败/)).toBeInTheDocument();
});

test('shows an error when loading fails', async () => {
  getDirectory.mockRejectedValue(new Error('500'));
  render(<DirectoryTab />);
  expect(await screen.findByText(/加载通讯录失败/)).toBeInTheDocument();
});

test('shows an empty state without entries', async () => {
  getDirectory.mockResolvedValue([]);
  render(<DirectoryTab />);
  expect(await screen.findByText(/暂无通讯录条目/)).toBeInTheDocument();
});

test('fetches nothing without a logged-in user', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<DirectoryTab />);
  expect(getDirectory).not.toHaveBeenCalled();
});
