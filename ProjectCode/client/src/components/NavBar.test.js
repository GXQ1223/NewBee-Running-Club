import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavBar, { navLinks } from './NavBar';
import { useAdmin, useAuth, useSocialLinks } from '../context';
import { getPendingMembers } from '../api/members';

jest.mock('../context', () => ({
  useAdmin: jest.fn(),
  useAuth: jest.fn(),
  useSocialLinks: jest.fn(),
}));
jest.mock('../api/members', () => ({ getPendingMembers: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const CONFIGURED_LINKS = {
  instagram: 'https://instagram.com/newbee',
  xiaohongshu: 'https://xhs.example.com/newbee',
  heylo: 'https://heylo.com/newbee',
  shop: 'https://shop.example.com',
  shopDemoVideo: 'https://cdn.example.com/demo.mp4',
};
const EMPTY_LINKS = { instagram: '', xiaohongshu: '', heylo: '', shop: '', shopDemoVideo: '' };

// Simulate a viewport width for MUI's useMediaQuery (min-width breakpoints)
function setViewportWidth(px) {
  window.matchMedia = (query) => {
    const m = /min-width:\s*([\d.]+)px/.exec(query);
    return {
      matches: m ? px >= parseFloat(m[1]) : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

function renderNavBar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setViewportWidth(1300); // desktop with pills (lg=1200), not "wide" (xl=1536)
  useAdmin.mockReturnValue({
    isAdmin: false,
    adminModeEnabled: false,
    toggleAdminMode: jest.fn(),
    memberData: null,
  });
  useAuth.mockReturnValue({ currentUser: null });
  useSocialLinks.mockReturnValue({ socialLinks: CONFIGURED_LINKS });
  getPendingMembers.mockResolvedValue([]);
});

describe('desktop nav pills', () => {
  test('renders every nav link as a pill with its route', () => {
    renderNavBar('/');
    navLinks.forEach((link) => {
      const pill = screen.getByRole('link', { name: new RegExp(`^${link.en}`) });
      expect(pill).toHaveAttribute('href', link.path);
    });
  });

  test('marks the pill matching the current route as active', () => {
    renderNavBar('/about');
    expect(screen.getByRole('link', { name: /^About Us/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^Sponsors/ })).not.toHaveAttribute('aria-current');
  });

  test('shows the short Join label below the xl breakpoint', () => {
    renderNavBar();
    expect(screen.getByRole('link', { name: /^Join 加入$/ })).toHaveAttribute('href', '/join');
    expect(screen.queryByText('Join NewBee 加入新蜂')).not.toBeInTheDocument();
  });

  test('shows the long Join label on wide screens', () => {
    setViewportWidth(1600);
    renderNavBar();
    expect(screen.getByRole('link', { name: /Join NewBee 加入新蜂/ })).toBeInTheDocument();
  });
});

describe('social icons', () => {
  test('configured links render enabled anchors with the right hrefs', () => {
    renderNavBar();
    const instagram = screen.getByTestId('InstagramIcon').closest('a');
    expect(instagram).toHaveAttribute('href', CONFIGURED_LINKS.instagram);
    expect(instagram).toHaveAttribute('target', '_blank');
    expect(instagram).not.toHaveClass('Mui-disabled');
    // Shop has no href — it opens a dialog instead
    const shop = screen.getByTestId('ShoppingBagIcon').closest('button');
    expect(shop).toBeEnabled();
  });

  test('unconfigured links are disabled for non-admins', () => {
    useSocialLinks.mockReturnValue({ socialLinks: EMPTY_LINKS });
    renderNavBar();
    expect(screen.getByTestId('InstagramIcon').closest('a')).toHaveClass('Mui-disabled');
    expect(screen.getByTestId('ShoppingBagIcon').closest('button')).toBeDisabled();
  });

  test('admin mode: clicking an unconfigured social icon navigates to settings', async () => {
    useSocialLinks.mockReturnValue({ socialLinks: EMPTY_LINKS });
    useAdmin.mockReturnValue({
      isAdmin: true,
      adminModeEnabled: true,
      toggleAdminMode: jest.fn(),
      memberData: { status: 'admin' },
    });
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    renderNavBar();

    fireEvent.click(screen.getByTestId('InstagramIcon').closest('a'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin?tab=settings');

    // Xiaohongshu and Heylo use custom SvgIcon components without testids;
    // they are the two remaining icon anchors between Instagram and Shop.
    const iconAnchors = document.querySelectorAll('a.MuiIconButton-root');
    iconAnchors.forEach((anchor) => fireEvent.click(anchor));
    mockNavigate.mockClear();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    expect(mockNavigate).toHaveBeenCalledWith('/admin?tab=settings');
    // Let the pending-members fetch fully settle inside the test
    await waitFor(() => expect(getPendingMembers).toHaveBeenCalled());
    await act(async () => {});
  });
});

describe('shop dialog flow', () => {
  test('opens the shop dialog and goes to the store in a new tab', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderNavBar();

    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    expect(screen.getByText('Shop / 商店')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Go to Store/ }));
    expect(openSpy).toHaveBeenCalledWith(CONFIGURED_LINKS.shop, '_blank', 'noopener,noreferrer');
    await waitFor(() => expect(screen.queryByText('Shop / 商店')).not.toBeInTheDocument());
    openSpy.mockRestore();
  });

  test('watch demo opens the video dialog and it can be closed', async () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Watch Demo/ }));

    const demoTitle = await screen.findByText(/Personalized Design Demo/);
    expect(demoTitle).toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('src', CONFIGURED_LINKS.shopDemoVideo);

    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    await waitFor(() =>
      expect(screen.queryByText(/Personalized Design Demo/)).not.toBeInTheDocument()
    );
  });

  test('the demo dialog closes on escape via its onClose handler', async () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Watch Demo/ }));
    const demoTitle = await screen.findByText(/Personalized Design Demo/);
    fireEvent.keyDown(demoTitle, { key: 'Escape', code: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText(/Personalized Design Demo/)).not.toBeInTheDocument()
    );
  });

  test('disables the option without a configured link', () => {
    useSocialLinks.mockReturnValue({ socialLinks: { ...CONFIGURED_LINKS, shopDemoVideo: '' } });
    renderNavBar();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    expect(screen.getByRole('button', { name: /Watch Demo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Go to Store/ })).toBeEnabled();
  });

  test('disables Go to Store when only the demo video is configured', () => {
    useSocialLinks.mockReturnValue({ socialLinks: { ...EMPTY_LINKS, shopDemoVideo: 'https://v.mp4' } });
    renderNavBar();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    expect(screen.getByRole('button', { name: /Go to Store/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Watch Demo/ })).toBeEnabled();
  });

  test('the shop dialog closes on escape via its onClose handler', async () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('ShoppingBagIcon').closest('button'));
    fireEvent.keyDown(screen.getByText('Shop / 商店'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Shop / 商店')).not.toBeInTheDocument());
  });
});

describe('admin box', () => {
  const adminContext = (overrides = {}) => ({
    isAdmin: true,
    adminModeEnabled: true,
    toggleAdminMode: jest.fn(),
    memberData: { status: 'admin' },
    ...overrides,
  });

  test('hidden for non-admins', () => {
    renderNavBar();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(getPendingMembers).not.toHaveBeenCalled();
  });

  test('visible for admins with pending-count badge from getPendingMembers', async () => {
    useAdmin.mockReturnValue(adminContext());
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    getPendingMembers.mockResolvedValue([{}, {}, {}]);
    setViewportWidth(1600); // wide: shows the "Admin" text label

    renderNavBar();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(getPendingMembers).toHaveBeenCalledWith('admin-1');
    const adminLink = screen.getByRole('link', { name: /Admin/ });
    expect(adminLink).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('committee members (non-full-admin) get the Committee label', async () => {
    useAdmin.mockReturnValue(adminContext({ memberData: { status: 'active' } }));
    useAuth.mockReturnValue({ currentUser: { uid: 'comm-1' } });
    setViewportWidth(1600);
    renderNavBar();
    expect(screen.getByRole('link', { name: /Committee/ })).toBeInTheDocument();
    // Let the pending-members fetch fully settle inside the test
    await waitFor(() => expect(getPendingMembers).toHaveBeenCalled());
    await act(async () => {});
  });

  test('badge resets to zero when the pending fetch fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    useAdmin.mockReturnValue(adminContext());
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    getPendingMembers.mockRejectedValue(new Error('fetch failed'));

    renderNavBar();
    await waitFor(() => expect(getPendingMembers).toHaveBeenCalled());
    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    errSpy.mockRestore();
  });

  test('no pending fetch when admin mode is off', () => {
    useAdmin.mockReturnValue(adminContext({ adminModeEnabled: false }));
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    renderNavBar();
    expect(getPendingMembers).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('the switch toggles admin mode', async () => {
    const toggleAdminMode = jest.fn();
    useAdmin.mockReturnValue(adminContext({ toggleAdminMode }));
    useAuth.mockReturnValue({ currentUser: { uid: 'admin-1' } });
    renderNavBar();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggleAdminMode).toHaveBeenCalledTimes(1);
    // Let the pending-members fetch fully settle inside the test
    await waitFor(() => expect(getPendingMembers).toHaveBeenCalled());
    await act(async () => {});
  });
});

describe('mobile drawer', () => {
  beforeEach(() => setViewportWidth(800));

  test('hides pills and opens the drawer from the hamburger', async () => {
    renderNavBar('/about');
    expect(screen.queryByRole('link', { name: /^Home/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    // Pills are hidden at this width, so drawer entries are the only matches
    navLinks.forEach((link) => {
      expect(screen.getByText(link.en)).toBeInTheDocument();
      expect(screen.getByText(link.cn)).toBeInTheDocument();
    });
    expect(screen.getByText('Join NewBee 加入新蜂')).toBeInTheDocument();
  });

  test('clicking a drawer link closes the drawer', async () => {
    renderNavBar();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.click(screen.getByText('About Us'));
    await waitFor(() => expect(screen.queryByText('主页')).not.toBeInTheDocument());
  });

  test('the drawer Join CTA closes the drawer', async () => {
    renderNavBar();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.click(screen.getByText('Join NewBee 加入新蜂'));
    await waitFor(() => expect(screen.queryByText('主页')).not.toBeInTheDocument());
  });

  test('the close button closes the drawer', async () => {
    renderNavBar();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.click(screen.getByTestId('CloseIcon').closest('button'));
    await waitFor(() => expect(screen.queryByText('主页')).not.toBeInTheDocument());
  });

  test('escape closes the drawer via onClose', async () => {
    renderNavBar();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.keyDown(screen.getByText('主页'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByText('主页')).not.toBeInTheDocument());
  });
});
