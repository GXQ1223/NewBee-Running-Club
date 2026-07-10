import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// Import through the barrel so src/context/index.js re-exports are covered too
import { SocialLinksProvider, useSocialLinks } from './index';
import { getSocialLinks } from '../api/settings';

jest.mock('../api/settings', () => ({ getSocialLinks: jest.fn() }));

const DEFAULT_INSTAGRAM = 'https://www.instagram.com/newbeerunningclub/';
const DEFAULT_HEYLO = 'https://www.heylo.com/g/b7bf1310-ca40-4d4d-9da5-2b7f4f3c197e';

function Probe() {
  const { socialLinks, loading, error, refreshLinks } = useSocialLinks();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="error">{error || 'no-error'}</span>
      <span data-testid="links">{JSON.stringify(socialLinks)}</span>
      <button onClick={refreshLinks}>refresh</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <SocialLinksProvider>
      <Probe />
    </SocialLinksProvider>
  );
}

const linksJson = () => JSON.parse(screen.getByTestId('links').textContent);

beforeEach(() => {
  jest.clearAllMocks();
});

test('merges API values with hardcoded defaults', async () => {
  getSocialLinks.mockResolvedValue({
    instagram: 'https://instagram.com/custom',
    shop: 'https://shop.example.com',
    shop_demo_video: 'https://cdn.example.com/demo.mp4',
    // xiaohongshu and heylo omitted -> fall back to defaults
  });

  renderProvider();
  expect(screen.getByTestId('loading')).toHaveTextContent('loading');
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

  const links = linksJson();
  expect(links.instagram).toBe('https://instagram.com/custom');
  expect(links.shop).toBe('https://shop.example.com');
  expect(links.shopDemoVideo).toBe('https://cdn.example.com/demo.mp4');
  expect(links.heylo).toBe(DEFAULT_HEYLO);
  expect(screen.getByTestId('error')).toHaveTextContent('no-error');
});

test('keeps defaults and exposes the error message when the API fails', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getSocialLinks.mockRejectedValue(new Error('boom'));

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

  expect(screen.getByTestId('error')).toHaveTextContent('boom');
  expect(linksJson().instagram).toBe(DEFAULT_INSTAGRAM);
  errSpy.mockRestore();
});

test('uses a fallback error message when the rejection has no message', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getSocialLinks.mockRejectedValue({});

  renderProvider();
  await waitFor(() =>
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to load social links')
  );
  errSpy.mockRestore();
});

test('refreshLinks refetches and applies updated values', async () => {
  getSocialLinks
    .mockResolvedValueOnce({ instagram: 'https://instagram.com/v1' })
    .mockResolvedValueOnce({}); // second fetch returns nothing -> all defaults

  renderProvider();
  await waitFor(() => expect(linksJson().instagram).toBe('https://instagram.com/v1'));

  fireEvent.click(screen.getByText('refresh'));
  await waitFor(() => expect(linksJson().instagram).toBe(DEFAULT_INSTAGRAM));
  expect(getSocialLinks).toHaveBeenCalledTimes(2);
});
