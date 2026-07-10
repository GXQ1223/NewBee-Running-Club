import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import { registerWithEmailAndPassword, signInWithGoogle } from '../firebase/auth';
import { submitExistingMemberAccountRequest } from '../api/members';

jest.mock('../firebase/auth', () => ({
  registerWithEmailAndPassword: jest.fn(),
  signInWithGoogle: jest.fn(),
}));
jest.mock('../api/members', () => ({
  submitExistingMemberAccountRequest: jest.fn(),
}));

const renderRegister = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div>HOME PROBE</div>} />
      </Routes>
    </MemoryRouter>
  );

const fillForm = ({
  name = 'Runner One',
  email = 'runner@x.com',
  password = 'secret123',
  confirm = 'secret123',
} = {}) => {
  fireEvent.change(screen.getByLabelText(/Name 姓名/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Email 邮箱/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password 密码/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: confirm } });
};

const submitForm = () =>
  fireEvent.submit(screen.getByRole('button', { name: /Create Account 创建账号/ }).closest('form'));

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders form with all required fields and links', () => {
  renderRegister();
  expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Name 姓名/)).toBeRequired();
  expect(screen.getByLabelText(/Email 邮箱/)).toBeRequired();
  expect(screen.getByLabelText(/^Password 密码/)).toBeRequired();
  expect(screen.getByLabelText(/Confirm Password/)).toBeRequired();
  expect(screen.getByRole('link', { name: /Sign In 登录/ })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: /Apply to join/ })).toHaveAttribute('href', '/join');
});

test('mismatched passwords show an error and skip registration', () => {
  renderRegister();
  fillForm({ confirm: 'different' });
  submitForm();

  expect(screen.getByText(/Passwords do not match/)).toBeInTheDocument();
  expect(registerWithEmailAndPassword).not.toHaveBeenCalled();
});

test('successful registration navigates to home', async () => {
  registerWithEmailAndPassword.mockResolvedValue({ user: { uid: 'u1' }, error: null });
  renderRegister();
  fillForm();
  submitForm();

  expect(await screen.findByText('HOME PROBE')).toBeInTheDocument();
  expect(registerWithEmailAndPassword).toHaveBeenCalledWith('runner@x.com', 'secret123', 'Runner One');
});

test('pending-approval registration notifies committee and shows success state', async () => {
  registerWithEmailAndPassword.mockResolvedValue({
    user: null,
    error: 'Your account is pending approval.',
  });
  submitExistingMemberAccountRequest.mockResolvedValue({});
  renderRegister();
  fillForm();
  submitForm();

  expect(await screen.findByText('Account Created!')).toBeInTheDocument();
  expect(submitExistingMemberAccountRequest).toHaveBeenCalledWith({
    name: 'Runner One',
    email: 'runner@x.com',
  });
  expect(screen.getByRole('link', { name: /Back to Login/ })).toHaveAttribute('href', '/login');
});

test('pending registration still succeeds when committee notification fails', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  registerWithEmailAndPassword.mockResolvedValue({ user: null, error: 'pending approval' });
  submitExistingMemberAccountRequest.mockRejectedValue(new Error('mail down'));
  renderRegister();
  fillForm();
  submitForm();

  expect(await screen.findByText('Account Created!')).toBeInTheDocument();
  errSpy.mockRestore();
});

test('duplicate-email error is shown to the user', async () => {
  registerWithEmailAndPassword.mockResolvedValue({
    user: null,
    error: 'Firebase: Error (auth/email-already-in-use).',
  });
  renderRegister();
  fillForm();
  submitForm();

  expect(
    await screen.findByText('Firebase: Error (auth/email-already-in-use).')
  ).toBeInTheDocument();
  expect(screen.queryByText('Account Created!')).not.toBeInTheDocument();
});

test('registration helper throwing shows generic error', async () => {
  registerWithEmailAndPassword.mockRejectedValue(new Error('boom'));
  renderRegister();
  fillForm();
  submitForm();

  expect(await screen.findByText(/Failed to create an account/)).toBeInTheDocument();
});

test('Google sign-up success navigates to home', async () => {
  signInWithGoogle.mockResolvedValue({ user: { uid: 'g1' }, error: null });
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText('HOME PROBE')).toBeInTheDocument();
});

test('Google sign-up pending path uses Google profile for the committee request', async () => {
  signInWithGoogle.mockResolvedValue({
    user: { displayName: 'G User', email: 'guser@gmail.com' },
    error: 'account is pending approval',
  });
  submitExistingMemberAccountRequest.mockResolvedValue({});
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText('Account Created!')).toBeInTheDocument();
  expect(submitExistingMemberAccountRequest).toHaveBeenCalledWith({
    name: 'G User',
    email: 'guser@gmail.com',
  });
});

test('Google sign-up pending path without user falls back to defaults', async () => {
  signInWithGoogle.mockResolvedValue({ user: null, error: 'pending approval' });
  submitExistingMemberAccountRequest.mockResolvedValue({});
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText('Account Created!')).toBeInTheDocument();
  expect(submitExistingMemberAccountRequest).toHaveBeenCalledWith({
    name: 'Google User',
    email: '',
  });
});

test('Google pending sign-up still succeeds when committee notification fails', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  signInWithGoogle.mockResolvedValue({
    user: { displayName: 'G User', email: 'guser@gmail.com' },
    error: 'pending approval',
  });
  submitExistingMemberAccountRequest.mockRejectedValue(new Error('mail down'));
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText('Account Created!')).toBeInTheDocument();
  errSpy.mockRestore();
});

test('Google sign-up error is displayed', async () => {
  signInWithGoogle.mockResolvedValue({ user: null, error: 'Popup blocked' });
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText('Popup blocked')).toBeInTheDocument();
});

test('Google sign-up throwing shows generic error', async () => {
  signInWithGoogle.mockRejectedValue(new Error('network'));
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Google' }));

  expect(await screen.findByText(/Failed to sign up with Google/)).toBeInTheDocument();
});
