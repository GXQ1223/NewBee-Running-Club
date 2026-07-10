import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
// Resolved by the firebase stub moduleNameMapper — a memoized jest.fn
import { onAuthStateChanged } from 'firebase/auth';

function Probe() {
  const { currentUser, loading } = useAuth();
  return (
    <div data-testid="auth-probe">
      {loading ? 'loading' : currentUser ? currentUser.uid : 'signed-out'}
    </div>
  );
}

beforeEach(() => {
  // Restore the stub's default behavior: report "no user" immediately
  onAuthStateChanged.mockReset();
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    if (typeof cb === 'function') cb(null);
    return () => {};
  });
});

test('provides null currentUser and renders children once auth state resolves', () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  expect(screen.getByTestId('auth-probe')).toHaveTextContent('signed-out');
});

test('provides the signed-in user to consumers', () => {
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    cb({ uid: 'user-9', displayName: 'Runner' });
    return () => {};
  });

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  expect(screen.getByTestId('auth-probe')).toHaveTextContent('user-9');
});

test('hides children while loading, then shows them when auth resolves late', () => {
  let savedCallback;
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    savedCallback = cb;
    return () => {};
  });

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  // Children gated behind {!loading && children}
  expect(screen.queryByTestId('auth-probe')).not.toBeInTheDocument();

  act(() => {
    savedCallback({ uid: 'late-user' });
  });
  expect(screen.getByTestId('auth-probe')).toHaveTextContent('late-user');
});

test('unsubscribes from auth state changes on unmount', () => {
  const unsubscribe = jest.fn();
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    cb(null);
    return unsubscribe;
  });

  const { unmount } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  expect(unsubscribe).not.toHaveBeenCalled();
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
