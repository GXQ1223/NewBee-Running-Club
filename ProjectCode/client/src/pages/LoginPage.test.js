import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './LoginPage';
import { loginWithEmailAndPassword, signInWithGoogle } from '../firebase/auth';

jest.mock('../firebase/auth', () => ({
  loginWithEmailAndPassword: jest.fn(),
  signInWithGoogle: jest.fn(),
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>HOME PROBE</div>} />
      </Routes>
    </MemoryRouter>
  );

const fillAndSubmit = (email = 'a@b.com', password = 'secret123') => {
  fireEvent.change(screen.getByLabelText(/Email 邮箱/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/Password 密码/), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: /Sign In 登录/ }).closest('form'));
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders sign-in form with required email/password fields', () => {
  renderLogin();
  expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Email 邮箱/)).toBeRequired();
  expect(screen.getByLabelText(/Password 密码/)).toBeRequired();
  expect(screen.getByRole('button', { name: /Sign In 登录/ })).toBeEnabled();
});

test('typing updates email and password fields', () => {
  renderLogin();
  fireEvent.change(screen.getByLabelText(/Email 邮箱/), { target: { value: 'x@y.com' } });
  fireEvent.change(screen.getByLabelText(/Password 密码/), { target: { value: 'pw' } });
  expect(screen.getByLabelText(/Email 邮箱/)).toHaveValue('x@y.com');
  expect(screen.getByLabelText(/Password 密码/)).toHaveValue('pw');
});

test('links to register and join pages are present', () => {
  renderLogin();
  expect(
    screen.getByRole('link', { name: /Create account directly/ })
  ).toHaveAttribute('href', '/register');
  expect(
    screen.getByRole('link', { name: /Apply to join/ })
  ).toHaveAttribute('href', '/join');
});

test('successful email/password login navigates to home', async () => {
  loginWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' }, error: null });
  renderLogin();
  fillAndSubmit('a@b.com', 'secret123');

  expect(await screen.findByText('HOME PROBE')).toBeInTheDocument();
  expect(loginWithEmailAndPassword).toHaveBeenCalledWith('a@b.com', 'secret123');
});

test('failed login shows the returned error message', async () => {
  loginWithEmailAndPassword.mockResolvedValue({ user: null, error: 'Invalid credentials' });
  renderLogin();
  fillAndSubmit();

  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  expect(screen.queryByText('HOME PROBE')).not.toBeInTheDocument();
});

test('login helper throwing shows generic error', async () => {
  loginWithEmailAndPassword.mockRejectedValue(new Error('boom'));
  renderLogin();
  fillAndSubmit();

  expect(await screen.findByText('Failed to sign in')).toBeInTheDocument();
});

test('buttons are disabled while login is in flight', async () => {
  let resolveLogin;
  loginWithEmailAndPassword.mockReturnValue(new Promise((res) => { resolveLogin = res; }));
  renderLogin();
  fillAndSubmit();

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Sign In 登录/ })).toBeDisabled()
  );
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDisabled();

  resolveLogin({ user: { uid: 'u1' }, error: null });
  expect(await screen.findByText('HOME PROBE')).toBeInTheDocument();
});

test('Google button calls signInWithGoogle and navigates on success', async () => {
  signInWithGoogle.mockResolvedValue({ user: { uid: 'g1' }, error: null });
  renderLogin();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

  expect(await screen.findByText('HOME PROBE')).toBeInTheDocument();
  expect(signInWithGoogle).toHaveBeenCalledTimes(1);
});

test('Google sign-in error is displayed', async () => {
  signInWithGoogle.mockResolvedValue({ user: null, error: 'Popup closed' });
  renderLogin();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

  expect(await screen.findByText('Popup closed')).toBeInTheDocument();
});

test('Google sign-in throwing shows generic error', async () => {
  signInWithGoogle.mockRejectedValue(new Error('network'));
  renderLogin();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

  expect(await screen.findByText('Failed to sign in with Google')).toBeInTheDocument();
});
