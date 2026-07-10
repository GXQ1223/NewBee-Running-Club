/**
 * Auto-mapped stub for all `firebase/<pkg>` imports in Jest (see package.json
 * moduleNameMapper). Returns a memoized jest.fn for any named import so no
 * real Firebase initialization or network happens in tests.
 */
/* eslint-disable no-undef */
const cache = {};

module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === '__esModule') return true;
      if (!cache[prop]) {
        cache[prop] = jest.fn((...args) => {
          // onAuthStateChanged(auth, cb) must return an unsubscribe fn
          if (prop === 'onAuthStateChanged') {
            const cb = typeof args[1] === 'function' ? args[1] : args[0];
            if (typeof cb === 'function') cb(null);
            return () => {};
          }
          return {};
        });
      }
      return cache[prop];
    },
  }
);
