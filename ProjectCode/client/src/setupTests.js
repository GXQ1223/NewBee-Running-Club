// Jest setup: DOM assertions + browser API polyfills missing from jsdom.
import '@testing-library/jest-dom';

// MUI useMediaQuery
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
window.IntersectionObserver = window.IntersectionObserver || ObserverStub;
window.ResizeObserver = window.ResizeObserver || ObserverStub;

window.scrollTo = window.scrollTo || (() => {});
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
}

// Silence noisy React 18 act() warnings only when they drown real failures is
// NOT done here — tests should handle async updates properly with waitFor.
