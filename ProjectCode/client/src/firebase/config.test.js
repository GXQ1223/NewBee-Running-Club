// firebase/* imports resolve to the memoized jest.fn stub via moduleNameMapper,
// so requiring config.js exercises the real initialization wiring with no network.
//
// CRA sets jest resetMocks: true, which wipes mock state recorded at module load
// time before every test. So each test re-requires the module graph fresh via
// resetModules, making the initializeApp/getAuth/getStorage calls observable.

describe('firebase config initialization', () => {
  let initializeApp;
  let getAuth;
  let getStorage;
  let auth;
  let storage;

  beforeEach(() => {
    jest.resetModules();
    ({ initializeApp } = require('firebase/app'));
    ({ getAuth } = require('firebase/auth'));
    ({ getStorage } = require('firebase/storage'));
    ({ auth, storage } = require('./config'));
  });

  test('initializes the app exactly once with the env-driven config keys', () => {
    expect(initializeApp).toHaveBeenCalledTimes(1);
    const config = initializeApp.mock.calls[0][0];
    expect(Object.keys(config)).toEqual([
      'apiKey',
      'authDomain',
      'projectId',
      'storageBucket',
      'messagingSenderId',
      'appId',
      'measurementId',
    ]);
  });

  test('config values come from REACT_APP_FIREBASE_* environment variables', () => {
    const config = initializeApp.mock.calls[0][0];
    expect(config.apiKey).toBe(process.env.REACT_APP_FIREBASE_API_KEY);
    expect(config.authDomain).toBe(process.env.REACT_APP_FIREBASE_AUTH_DOMAIN);
    expect(config.projectId).toBe(process.env.REACT_APP_FIREBASE_PROJECT_ID);
    expect(config.storageBucket).toBe(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET);
    expect(config.messagingSenderId).toBe(
      process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID
    );
    expect(config.appId).toBe(process.env.REACT_APP_FIREBASE_APP_ID);
    expect(config.measurementId).toBe(process.env.REACT_APP_FIREBASE_MEASUREMENT_ID);
  });

  test('exports auth created from the initialized app', () => {
    const app = initializeApp.mock.results[0].value;
    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledWith(app);
    expect(auth).toBe(getAuth.mock.results[0].value);
  });

  test('exports storage created from the initialized app', () => {
    const app = initializeApp.mock.results[0].value;
    expect(getStorage).toHaveBeenCalledTimes(1);
    expect(getStorage).toHaveBeenCalledWith(app);
    expect(storage).toBe(getStorage.mock.results[0].value);
  });
});
