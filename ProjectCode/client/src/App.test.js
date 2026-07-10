import { act, render, screen } from '@testing-library/react';
import { amber } from '@mui/material/colors';
// Resolved by the firebase stub moduleNameMapper — a memoized jest.fn
import { onAuthStateChanged } from 'firebase/auth';
import App, { theme } from './App';
import { getEventsByStatus } from './api';
import { getCarouselBanners } from './api/banners';
import { getActiveSections } from './api/homepageSections';
import { getSocialLinks } from './api/settings';
import { getMemberByFirebaseUid, getPendingMembers } from './api/members';

// --- API mocks: keep the real home route render deterministic and offline ---
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  getEventsByStatus: jest.fn(),
  updateEvent: jest.fn(),
}));
jest.mock('./api/banners', () => ({
  ...jest.requireActual('./api/banners'),
  getCarouselBanners: jest.fn(),
  updateBanner: jest.fn(),
}));
jest.mock('./api/homepageSections', () => ({
  ...jest.requireActual('./api/homepageSections'),
  getActiveSections: jest.fn(),
  updateSection: jest.fn(),
  reorderSections: jest.fn(),
  uploadImage: jest.fn(),
}));
jest.mock('./api/settings', () => ({
  ...jest.requireActual('./api/settings'),
  getSocialLinks: jest.fn(),
}));
jest.mock('./api/members', () => ({
  ...jest.requireActual('./api/members'),
  getPendingMembers: jest.fn(),
  getMemberByFirebaseUid: jest.fn(),
  syncFirebaseUser: jest.fn(),
}));

// CRA's resetMocks: true wipes implementations before every test,
// so all default behaviors are (re-)installed here.
beforeEach(() => {
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    if (typeof cb === 'function') cb(null); // signed out
    return () => {};
  });
  getEventsByStatus.mockResolvedValue([]);
  getCarouselBanners.mockResolvedValue([]);
  getActiveSections.mockResolvedValue([]);
  getSocialLinks.mockResolvedValue({});
  getPendingMembers.mockResolvedValue([]);
  getMemberByFirebaseUid.mockResolvedValue(null);
});

// --- Lazy page stubs: light components so every lazy route can be exercised ---
jest.mock('./pages/AboutPage', () => ({ __esModule: true, default: () => 'stub-about-page' }));
jest.mock('./pages/AdminPanelPage', () => ({ __esModule: true, default: () => 'stub-admin-page' }));
jest.mock('./pages/CalendarPage', () => ({ __esModule: true, default: () => 'stub-calendar-page' }));
jest.mock('./pages/GalleryPage', () => ({ __esModule: true, default: () => 'stub-gallery-page' }));
jest.mock('./pages/HighlightsPage', () => ({ __esModule: true, default: () => 'stub-highlights-page' }));
jest.mock('./pages/JoinPage', () => ({ __esModule: true, default: () => 'stub-join-page' }));
jest.mock('./pages/LoginPage', () => ({ __esModule: true, default: () => 'stub-login-page' }));
jest.mock('./pages/ProfilePage', () => ({ __esModule: true, default: () => 'stub-profile-page' }));
jest.mock('./pages/RecordsPage', () => ({ __esModule: true, default: () => 'stub-records-page' }));
jest.mock('./pages/RegisterPage', () => ({ __esModule: true, default: () => 'stub-register-page' }));
jest.mock('./pages/SponsorsPage', () => ({ __esModule: true, default: () => 'stub-sponsors-page' }));
jest.mock('./pages/TrainingPage', () => ({ __esModule: true, default: () => 'stub-training-page' }));

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

// Flush any trailing provider promise resolutions to avoid act() warnings.
const flush = async () => {
  await act(async () => {});
};

describe('theme', () => {
  test('uses the brand orange as primary color', () => {
    expect(theme.palette.primary.main).toBe('#FFA500');
    expect(theme.palette.primary.dark).toBe('#F29400');
    expect(theme.palette.primary.light).toBe('#FFB84D');
    expect(theme.palette.primary.contrastText).toBe('#FFFFFF');
  });

  test('uses amber as the secondary color and rounded corners', () => {
    // MUI derives `main` for a secondary palette from the A400 shade
    expect(theme.palette.secondary.main).toBe(amber.A400);
    expect(Object.values(amber)).toContain(theme.palette.secondary.main);
    expect(theme.shape.borderRadius).toBe(12);
  });
});

describe('App shell', () => {
  test('shows the Suspense fallback, then renders a lazy route', async () => {
    renderAt('/about');

    // The lazy chunk has not resolved yet: the fallback spinner is visible
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    expect(await screen.findByText('stub-about-page')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await flush();
  });

  test('renders the home route with NavBar, HomePage, and footer', async () => {
    renderAt('/');

    // NavBar navigation is present
    expect((await screen.findAllByText(/about us/i)).length).toBeGreaterThan(0);
    // HomePage content mounted (hero imagery)
    expect(
      (await screen.findAllByAltText(/NewBee Running Club/i)).length
    ).toBeGreaterThan(0);
    // Footer copyright with the current year
    const year = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`Copyright © ${year} NewBee Running Club`))
    ).toBeInTheDocument();
    await flush();
  });

  test.each([
    ['/highlights', 'stub-highlights-page'],
    ['/calendar', 'stub-calendar-page'],
    ['/training', 'stub-training-page'],
    ['/training/ai', 'stub-training-page'],
    ['/training/community', 'stub-training-page'],
    ['/training/routes', 'stub-training-page'],
    ['/records', 'stub-records-page'],
    ['/join', 'stub-join-page'],
    ['/sponsors', 'stub-sponsors-page'],
    ['/login', 'stub-login-page'],
    ['/register', 'stub-register-page'],
    ['/profile', 'stub-profile-page'],
    ['/admin', 'stub-admin-page'],
    ['/events/42/gallery', 'stub-gallery-page'],
  ])('renders the lazy page for %s', async (path, stubText) => {
    renderAt(path);
    expect(await screen.findByText(stubText)).toBeInTheDocument();
    await flush();
  });
});
