import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminProvider, useAdmin } from './AdminContext';
import { useAuth } from './AuthContext';
import { getMemberByFirebaseUid } from '../api/members';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../api/members', () => ({ getMemberByFirebaseUid: jest.fn() }));

const STORAGE_KEY = 'newbee_admin_mode_enabled';

function Probe() {
  const { isAdmin, adminModeEnabled, toggleAdminMode, memberData, loading } = useAdmin();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="is-admin">{isAdmin ? 'admin' : 'not-admin'}</span>
      <span data-testid="mode">{adminModeEnabled ? 'on' : 'off'}</span>
      <span data-testid="member">{memberData ? memberData.status : 'none'}</span>
      <button onClick={toggleAdminMode}>toggle</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AdminProvider>
      <Probe />
    </AdminProvider>
  );
}

async function waitReady() {
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  useAuth.mockReturnValue({ currentUser: null });
  getMemberByFirebaseUid.mockResolvedValue(null);
});

test('signed-out user: not admin, mode off, no member data', async () => {
  renderProvider();
  await waitReady();
  expect(screen.getByTestId('is-admin')).toHaveTextContent('not-admin');
  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  expect(screen.getByTestId('member')).toHaveTextContent('none');
  expect(getMemberByFirebaseUid).not.toHaveBeenCalled();
});

test('member with status admin becomes admin; toggle persists mode to localStorage', async () => {
  useAuth.mockReturnValue({ currentUser: { uid: 'u1', displayName: 'Whoever' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'admin', display_name: 'Some Person' });

  renderProvider();
  await waitReady();
  expect(screen.getByTestId('is-admin')).toHaveTextContent('admin');
  expect(screen.getByTestId('member')).toHaveTextContent('admin');

  fireEvent.click(screen.getByText('toggle'));
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('true'));

  fireEvent.click(screen.getByText('toggle'));
  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
});

test('regular member whose name is on the committee list is treated as admin', async () => {
  useAuth.mockReturnValue({ currentUser: { uid: 'u2', displayName: 'Nobody' } });
  // Brandon Shen is in src/data/committeeMembers.js
  getMemberByFirebaseUid.mockResolvedValue({ status: 'active', display_name: 'Brandon Shen' });

  renderProvider();
  await waitReady();
  expect(screen.getByTestId('is-admin')).toHaveTextContent('admin');
});

test('falls back to Firebase displayName committee check when member lookup fails', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  useAuth.mockReturnValue({ currentUser: { uid: 'u3', displayName: 'brandon shen' } });
  getMemberByFirebaseUid.mockRejectedValue(new Error('api down'));

  renderProvider();
  await waitReady();
  expect(screen.getByTestId('is-admin')).toHaveTextContent('admin');
  errSpy.mockRestore();
});

test('member lookup failure with non-committee displayName leaves user non-admin', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  useAuth.mockReturnValue({ currentUser: { uid: 'u4', displayName: 'Random Runner' } });
  getMemberByFirebaseUid.mockRejectedValue(new Error('api down'));

  renderProvider();
  await waitReady();
  expect(screen.getByTestId('is-admin')).toHaveTextContent('not-admin');
  errSpy.mockRestore();
});

test('stale stored admin mode is reset for non-admin users', async () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  useAuth.mockReturnValue({ currentUser: { uid: 'u5', displayName: 'Nobody' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'active', display_name: 'Nobody' });

  renderProvider();
  await waitReady();
  await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('off'));
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('persisted admin mode is restored for admins', async () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  useAuth.mockReturnValue({ currentUser: { uid: 'u6', displayName: 'X' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'admin' });

  renderProvider();
  await waitReady();
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
});

test('toggleAdminMode is a no-op for non-admins', async () => {
  useAuth.mockReturnValue({ currentUser: { uid: 'u7', displayName: 'Nobody' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'active', display_name: 'Nobody' });

  renderProvider();
  await waitReady();
  fireEvent.click(screen.getByText('toggle'));
  expect(screen.getByTestId('mode')).toHaveTextContent('off');
});

test('logging out resets admin mode and clears storage', async () => {
  useAuth.mockReturnValue({ currentUser: { uid: 'u8' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'admin' });

  const { rerender } = renderProvider();
  await waitReady();
  fireEvent.click(screen.getByText('toggle'));
  await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('true'));

  useAuth.mockReturnValue({ currentUser: null });
  rerender(
    <AdminProvider>
      <Probe />
    </AdminProvider>
  );
  await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('off'));
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('survives localStorage read errors (private browsing)', async () => {
  const getSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  renderProvider();
  await waitReady();
  expect(screen.getByTestId('mode')).toHaveTextContent('off');
  getSpy.mockRestore();
});

test('survives localStorage write errors when toggling', async () => {
  useAuth.mockReturnValue({ currentUser: { uid: 'u9' } });
  getMemberByFirebaseUid.mockResolvedValue({ status: 'admin' });
  renderProvider();
  await waitReady();

  const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  fireEvent.click(screen.getByText('toggle'));
  expect(screen.getByTestId('mode')).toHaveTextContent('on');
  setSpy.mockRestore();
});
