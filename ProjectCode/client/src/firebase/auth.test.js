// firebase/auth resolves to the memoized jest.fn stub via moduleNameMapper.
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth } from './config';
import { syncFirebaseUser } from '../api/members';
import {
  loginWithEmailAndPassword,
  registerWithEmailAndPassword,
  signInWithGoogle,
  signInWithFacebook,
  resetPassword,
  logout,
} from './auth';

jest.mock('../api/members', () => ({
  syncFirebaseUser: jest.fn(),
}));

const user = {
  uid: 'uid-1',
  email: 'runner@newbee.org',
  displayName: 'Runner One',
  photoURL: 'https://img/p.png',
};

const expectedSyncPayload = {
  firebase_uid: 'uid-1',
  email: 'runner@newbee.org',
  display_name: 'Runner One',
  photo_url: 'https://img/p.png',
};

let errorSpy;

beforeEach(() => {
  [
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
    sendPasswordResetEmail,
    signOut,
    syncFirebaseUser,
  ].forEach((fn) => fn.mockReset());

  syncFirebaseUser.mockResolvedValue({ status: 'active' });
  signOut.mockResolvedValue(undefined);
  // The stub's default implementation returns a plain object, which would make
  // `new GoogleAuthProvider()` evaluate to that object instead of a provider
  // instance. Give the provider constructors empty implementations so `new`
  // yields real instances and expect.any(<Provider>) can match them.
  GoogleAuthProvider.mockImplementation(function GoogleProvider() {});
  FacebookAuthProvider.mockImplementation(function FacebookProvider() {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('loginWithEmailAndPassword', () => {
  test('signs in, syncs the user to the database, and returns the user', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user });

    const result = await loginWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'runner@newbee.org',
      'pw123'
    );
    expect(syncFirebaseUser).toHaveBeenCalledWith(expectedSyncPayload);
    expect(result).toEqual({ user, error: null });
  });

  test('signs out and returns a pending-approval error when member is pending', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user });
    syncFirebaseUser.mockResolvedValue({ status: 'pending' });

    const result = await loginWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/pending approval/i);
  });

  test('signs out and returns a deactivated error when member quit', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user });
    syncFirebaseUser.mockResolvedValue({ status: 'quit' });

    const result = await loginWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/deactivated/i);
  });

  test('still returns the user when the database sync fails (auth succeeded)', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user });
    syncFirebaseUser.mockRejectedValue(new Error('db down'));

    const result = await loginWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(errorSpy).toHaveBeenCalled();
    expect(result).toEqual({ user, error: null });
  });

  test('returns the firebase error message on sign-in failure', async () => {
    signInWithEmailAndPassword.mockRejectedValue(new Error('auth/wrong-password'));

    const result = await loginWithEmailAndPassword('runner@newbee.org', 'bad');

    expect(result).toEqual({ user: null, error: 'auth/wrong-password' });
    expect(syncFirebaseUser).not.toHaveBeenCalled();
  });
});

describe('registerWithEmailAndPassword', () => {
  test('creates the account, sets display name, and syncs with it', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user });
    updateProfile.mockResolvedValue(undefined);

    const result = await registerWithEmailAndPassword(
      'runner@newbee.org',
      'pw123',
      'New Name'
    );

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'runner@newbee.org',
      'pw123'
    );
    expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'New Name' });
    expect(syncFirebaseUser).toHaveBeenCalledWith({
      ...expectedSyncPayload,
      display_name: 'New Name',
    });
    expect(result).toEqual({ user, error: null });
  });

  test('skips updateProfile when no display name is provided and falls back to user.displayName', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user });

    const result = await registerWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(updateProfile).not.toHaveBeenCalled();
    expect(syncFirebaseUser).toHaveBeenCalledWith(expectedSyncPayload);
    expect(result).toEqual({ user, error: null });
  });

  test('returns the pending message for new registrations pending approval', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user });
    syncFirebaseUser.mockResolvedValue({ status: 'pending' });

    const result = await registerWithEmailAndPassword(
      'runner@newbee.org',
      'pw123',
      'New Name'
    );

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/pending approval/i);
  });

  test('returns the firebase error message on registration failure', async () => {
    createUserWithEmailAndPassword.mockRejectedValue(
      new Error('auth/email-already-in-use')
    );

    const result = await registerWithEmailAndPassword('runner@newbee.org', 'pw123');

    expect(result).toEqual({ user: null, error: 'auth/email-already-in-use' });
  });
});

describe('signInWithGoogle', () => {
  test('opens a popup with a GoogleAuthProvider and returns the user', async () => {
    signInWithPopup.mockResolvedValue({ user });

    const result = await signInWithGoogle();

    expect(signInWithPopup).toHaveBeenCalledWith(
      auth,
      expect.any(GoogleAuthProvider)
    );
    expect(syncFirebaseUser).toHaveBeenCalledWith(expectedSyncPayload);
    expect(result).toEqual({ user, error: null });
  });

  test('returns a status error for pending members', async () => {
    signInWithPopup.mockResolvedValue({ user });
    syncFirebaseUser.mockResolvedValue({ status: 'pending' });

    const result = await signInWithGoogle();

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/pending approval/i);
  });

  test('returns the popup error message on failure', async () => {
    signInWithPopup.mockRejectedValue(new Error('popup-closed'));

    const result = await signInWithGoogle();

    expect(result).toEqual({ user: null, error: 'popup-closed' });
  });
});

describe('signInWithFacebook', () => {
  test('opens a popup with a FacebookAuthProvider and returns the user', async () => {
    signInWithPopup.mockResolvedValue({ user });

    const result = await signInWithFacebook();

    expect(signInWithPopup).toHaveBeenCalledWith(
      auth,
      expect.any(FacebookAuthProvider)
    );
    expect(result).toEqual({ user, error: null });
  });

  test('returns a status error for quit members', async () => {
    signInWithPopup.mockResolvedValue({ user });
    syncFirebaseUser.mockResolvedValue({ status: 'quit' });

    const result = await signInWithFacebook();

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result.user).toBeNull();
    expect(result.error).toMatch(/deactivated/i);
  });

  test('returns the popup error message on failure', async () => {
    signInWithPopup.mockRejectedValue(new Error('popup-blocked'));

    const result = await signInWithFacebook();

    expect(result).toEqual({ user: null, error: 'popup-blocked' });
  });
});

describe('resetPassword', () => {
  test('sends a reset email and reports success', async () => {
    sendPasswordResetEmail.mockResolvedValue(undefined);

    const result = await resetPassword('runner@newbee.org');

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'runner@newbee.org');
    expect(result).toEqual({ success: true, error: null });
  });

  test('reports failure with the error message', async () => {
    sendPasswordResetEmail.mockRejectedValue(new Error('auth/user-not-found'));

    const result = await resetPassword('nobody@newbee.org');

    expect(result).toEqual({ success: false, error: 'auth/user-not-found' });
  });
});

describe('logout', () => {
  test('signs out and reports success', async () => {
    const result = await logout();

    expect(signOut).toHaveBeenCalledWith(auth);
    expect(result).toEqual({ success: true, error: null });
  });

  test('reports failure with the error message', async () => {
    signOut.mockRejectedValue(new Error('network'));

    const result = await logout();

    expect(result).toEqual({ success: false, error: 'network' });
  });
});
