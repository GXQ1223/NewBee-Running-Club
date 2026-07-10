import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProfilePage from './ProfilePage';
import { useAuth } from '../context';
import { logout } from '../firebase/auth';
import { getMemberByFirebaseUid, updateMember } from '../api/members';
import { getMemberRaceResults } from '../api/results';
import { getMemberCredits } from '../api/credits';
import { uploadBytes, getDownloadURL } from 'firebase/storage';

jest.mock('../context', () => ({ useAuth: jest.fn() }));
jest.mock('../hooks', () => ({
  useAutoFillOnTab: () => jest.fn(),
  useTranslationAutoFill: () => ({
    handleKeyDown: jest.fn(),
    handleBlur: jest.fn(),
    translations: {},
    isTranslating: false,
  }),
}));
jest.mock('../firebase/auth', () => ({ logout: jest.fn() }));
jest.mock('../api/members', () => ({
  getMemberByFirebaseUid: jest.fn(),
  updateMember: jest.fn(),
}));
jest.mock('../api/results', () => ({ getMemberRaceResults: jest.fn() }));
jest.mock('../api/credits', () => ({ getMemberCredits: jest.fn() }));

const fbUser = {
  uid: 'uid-1',
  displayName: 'Firebase Name',
  email: 'fb@x.com',
  photoURL: null,
};

const member = {
  id: 7,
  nickname: 'Speedy',
  display_name: 'John Doe',
  email: 'john@x.com',
  phone: '123-456',
  nyrr_member_id: 'NY123',
  gender: 'M',
  birth_year: 1990,
  join_date: '2020-01-01',
  emergency_contact_name: 'Jane',
  emergency_contact_phone: '999',
  location: 'NYC',
  weekly_frequency: '3x per week',
  monthly_mileage: '100 miles',
  running_experience: '5 years running',
  goals: 'Qualify for Boston',
  status: 'runner',
  profile_photo_url: null,
};

const credits = {
  registration_credits: 5,
  checkin_credits: 2,
  volunteer_credits: 1,
  activity_credits: 3,
};

const raceData = {
  results: [
    { id: 1, race_date: '2024-01-01', race: 'Alpha 5K', distance: '5K', overall_time: '0:20:00', pace: '6:26', overall_place: 10, gender_place: 3 },
    { id: 2, race_date: '2023-06-01', race: 'Bravo Half', distance: 'Half Marathon', overall_time: '1:40:00', pace: '7:38', overall_place: 50 },
    { id: 3, race_date: '2023-03-01', race: 'Charlie Ten Mile', distance: '10M', overall_time: null, pace: null, overall_place: null },
    { id: 4, race_date: '2022-11-01', race: 'Delta Marathon', distance: 'Marathon', overall_time: '3:30:00', pace: '8:00', overall_place: 200 },
    { id: 5, race_date: '2022-05-01', race: 'Echo Four', distance: '4 miles', overall_time: '0:30:00', pace: '7:30', overall_place: 20 },
    { id: 6, race_date: '2021-05-01', race: 'Foxtrot Ten K', distance: '10 km', overall_time: '0:45:00', pace: '7:15', overall_place: 30 },
    { id: 7, race_date: '2021-02-01', race: 'Hotel Eight', distance: '8.5', overall_time: '0:40:00', pace: '8:05', overall_place: 60 },
    { id: 8, race_date: '2021-01-01', race: 'Golf Unknown', distance: 'weird', overall_time: '0:50:00', pace: '8:05', overall_place: 40 },
  ],
  stats: {
    total_races: 8,
    prs: {
      '5K': { time: '0:20:00', race: 'Alpha 5K', date: '2024-01-01', pace: '6:26' },
      Marathon: { time: '3:30:00', race: 'Delta Marathon', date: '2022-11-01' },
    },
    recent_results: [{}, {}],
  },
};

const renderProfile = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<div>LOGIN PROBE</div>} />
      </Routes>
    </MemoryRouter>
  );

const settle = async () => {
  await screen.findByText('Speedy');
  await waitFor(() => expect(getMemberRaceResults).toHaveBeenCalled());
};

const firstDataRowText = () => screen.getAllByRole('row')[1].textContent;

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: fbUser });
  getMemberByFirebaseUid.mockResolvedValue(member);
  getMemberCredits.mockResolvedValue(credits);
  getMemberRaceResults.mockResolvedValue(raceData);
  logout.mockResolvedValue({ error: null });
  updateMember.mockResolvedValue({});
});

test('redirects to /login when no user is signed in', async () => {
  useAuth.mockReturnValue({ currentUser: null });
  renderProfile();
  expect(await screen.findByText('LOGIN PROBE')).toBeInTheDocument();
});

test('renders profile fields, credits, PRs, and race history from member data', async () => {
  renderProfile();
  await settle();

  // Header + basic info
  expect(screen.getByText('Speedy')).toBeInTheDocument();
  expect(screen.getByText('john@x.com')).toBeInTheDocument();
  expect(screen.getByText('Member / 会员')).toBeInTheDocument();
  expect(screen.getByText('123-456')).toBeInTheDocument();
  expect(screen.getByText('NY123')).toBeInTheDocument();
  expect(screen.getByText('Male / 男')).toBeInTheDocument();
  expect(screen.getByText('1990')).toBeInTheDocument();
  expect(screen.getByText('2020-01-01')).toBeInTheDocument();
  expect(screen.getByText('Jane (999)')).toBeInTheDocument();

  // Running profile section
  expect(screen.getByText('Running Profile')).toBeInTheDocument();
  expect(screen.getByText('NYC')).toBeInTheDocument();
  expect(screen.getByText('3x per week')).toBeInTheDocument();
  expect(screen.getByText('100 miles')).toBeInTheDocument();
  expect(screen.getByText('5 years running')).toBeInTheDocument();
  expect(screen.getByText('Qualify for Boston')).toBeInTheDocument();

  // Club credits
  expect(screen.getByText('Club Credits')).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();

  // Race stats + PR cards
  expect(screen.getByText('8')).toBeInTheDocument(); // total races
  expect(screen.getByText('NYRR Personal Records')).toBeInTheDocument();
  expect(screen.getAllByText('0:20:00').length).toBeGreaterThanOrEqual(2); // PR card + table
  expect(screen.getByText(/Pace: 6:26/)).toBeInTheDocument();

  // Race history rows (8 data rows + header)
  expect(screen.getAllByRole('row')).toHaveLength(9);
  expect(screen.getByText('Gender: #3')).toBeInTheDocument();

  // Correct API call with matching options
  expect(getMemberRaceResults).toHaveBeenCalledWith('NY123', { gender: 'M', birth_year: 1990 });
  expect(getMemberCredits).toHaveBeenCalledWith('John Doe');
});

test('race history sorts by each column', async () => {
  renderProfile();
  await settle();

  // Default: race_date desc
  expect(firstDataRowText()).toContain('Alpha 5K');

  // Toggle date to asc
  fireEvent.click(screen.getByText('Date / 日期'));
  expect(firstDataRowText()).toContain('Golf Unknown'); // 2021-01-01

  // Sort by race name asc, then desc
  fireEvent.click(screen.getByText('Race / 比赛'));
  expect(firstDataRowText()).toContain('Alpha 5K');
  fireEvent.click(screen.getByText('Race / 比赛'));
  expect(firstDataRowText()).toContain('Hotel Eight');

  // Distance asc: unparseable 'weird' -> 0 meters first
  fireEvent.click(screen.getByText('Distance / 距离'));
  expect(firstDataRowText()).toContain('Golf Unknown');

  // Time asc: fastest first, null time sorts last
  fireEvent.click(screen.getByText('Time / 成绩'));
  expect(firstDataRowText()).toContain('Alpha 5K');
  expect(screen.getAllByRole('row')[8].textContent).toContain('Charlie Ten Mile');

  // Pace asc
  fireEvent.click(screen.getByText('Pace / 配速'));
  expect(firstDataRowText()).toContain('Alpha 5K');

  // Place asc
  fireEvent.click(screen.getByText('Place / 名次'));
  expect(firstDataRowText()).toContain('#10');
});

test('edit dialog saves profile changes and refreshes data', async () => {
  renderProfile();
  await settle();

  fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
  expect(screen.getByText('Edit Profile / 编辑资料')).toBeInTheDocument();

  const nickname = screen.getByLabelText(/Nickname/);
  expect(nickname).toHaveValue('Speedy');
  fireEvent.change(nickname, { target: { value: 'Flash' } });

  // Fields with auto-fill/translation handlers accept keydown without crashing
  fireEvent.keyDown(screen.getByLabelText(/^Phone/), { key: 'Tab' });

  fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));

  await waitFor(() =>
    expect(updateMember).toHaveBeenCalledWith(7, expect.objectContaining({ nickname: 'Flash' }))
  );
  expect(await screen.findByText(/Profile updated successfully/)).toBeInTheDocument();
  // Refetch after save
  await waitFor(() => expect(getMemberByFirebaseUid).toHaveBeenCalledTimes(2));
});

test('edit dialog cancel closes without saving; save failure shows error', async () => {
  renderProfile();
  await settle();

  // Cancel path
  fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Cancel \/ 取消/ }));
  await waitFor(() =>
    expect(screen.queryByLabelText(/Nickname/)).not.toBeInTheDocument()
  );
  expect(updateMember).not.toHaveBeenCalled();

  // Failure path
  updateMember.mockRejectedValueOnce(new Error('server down'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
  expect(await screen.findByText(/Failed to update profile/)).toBeInTheDocument();
});

test('logout button calls logout and surfaces errors', async () => {
  renderProfile();
  await settle();

  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));

  logout.mockResolvedValueOnce({ error: 'Sign out failed' });
  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  expect(await screen.findByText('Sign out failed')).toBeInTheDocument();

  logout.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  expect(await screen.findByText('Failed to log out')).toBeInTheDocument();
});

test('photo upload stores file and updates member photo URL', async () => {
  uploadBytes.mockResolvedValue({});
  getDownloadURL.mockResolvedValue('https://cdn/photo.png');

  const { container } = renderProfile();
  await settle();

  // Clicking the avatar proxies to the hidden file input
  fireEvent.click(container.querySelector('.MuiAvatar-root'));

  const input = container.querySelector('input[type="file"]');
  const file = new File(['img-bytes'], 'me.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() =>
    expect(updateMember).toHaveBeenCalledWith(7, { profile_photo_url: 'https://cdn/photo.png' })
  );
  expect(await screen.findByText(/Profile photo updated/)).toBeInTheDocument();
  expect(uploadBytes).toHaveBeenCalled();
});

test('photo upload validates file type and size', async () => {
  const { container } = renderProfile();
  await settle();
  const input = container.querySelector('input[type="file"]');

  // Wrong type
  const textFile = new File(['nope'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [textFile] } });
  expect(await screen.findByText(/Please select an image file/)).toBeInTheDocument();

  // Too large
  const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
  Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
  fireEvent.change(input, { target: { files: [bigFile] } });
  expect(await screen.findByText(/Image size must be less than 5MB/)).toBeInTheDocument();

  expect(uploadBytes).not.toHaveBeenCalled();
  expect(updateMember).not.toHaveBeenCalled();
});

test('photo upload failure shows an error', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  uploadBytes.mockRejectedValueOnce(new Error('s3 down'));

  const { container } = renderProfile();
  await settle();

  const input = container.querySelector('input[type="file"]');
  const file = new File(['img'], 'me.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });

  expect(await screen.findByText(/Failed to upload photo/)).toBeInTheDocument();
  errSpy.mockRestore();
});

test('member without id cannot upload photo or save profile', async () => {
  const noIdMember = { ...member, id: undefined };
  getMemberByFirebaseUid.mockResolvedValue(noIdMember);

  const { container } = renderProfile();
  await settle();

  const input = container.querySelector('input[type="file"]');
  const file = new File(['img'], 'me.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText(/Cannot upload photo/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Save \/ 保存/ }));
  expect(await screen.findByText(/Cannot update profile/)).toBeInTheDocument();
  expect(updateMember).not.toHaveBeenCalled();
});

test('shows hints and empty race history when matching info is missing', async () => {
  getMemberByFirebaseUid.mockResolvedValue({
    id: 9,
    display_name: 'Min Member',
    email: 'min@x.com',
    status: 'pending',
  });
  getMemberRaceResults.mockResolvedValue({
    results: [],
    stats: { total_races: 0, prs: {}, recent_results: [] },
  });

  renderProfile();
  await screen.findByText('Min Member');

  expect(screen.getByText('Pending / 待审核')).toBeInTheDocument();
  expect(
    screen.getAllByText(/Fill in to see your NYRR records/).length
  ).toBe(2);
  expect(await screen.findByText(/No race results found/)).toBeInTheDocument();
  expect(screen.getByText(/Add your NYRR ID/)).toBeInTheDocument();
  // No PR section, no Running Profile section
  expect(screen.queryByText('NYRR Personal Records')).not.toBeInTheDocument();
  expect(screen.queryByText('Running Profile')).not.toBeInTheDocument();
});

test('tolerates member/credits/race API failures', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getMemberByFirebaseUid.mockRejectedValueOnce(new Error('404'));

  const { container } = renderProfile();
  // Falls back to Firebase display name; no edit button without member data
  expect(await screen.findByText('Firebase Name')).toBeInTheDocument();
  // Wait for the loading skeleton to clear so all state updates land in-test
  await waitFor(() =>
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(0)
  );
  expect(screen.queryByRole('button', { name: 'Edit Profile' })).not.toBeInTheDocument();
  errSpy.mockRestore();
});

test('credits and race fetch errors do not break the page', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getMemberCredits.mockRejectedValueOnce(new Error('credits down'));
  getMemberRaceResults.mockRejectedValueOnce(new Error('races down'));

  renderProfile();
  await settle();

  expect(screen.getByText('Speedy')).toBeInTheDocument();
  // Credits fall back to zeros
  const zeros = screen.getAllByText('0');
  expect(zeros.length).toBeGreaterThanOrEqual(4);
  errSpy.mockRestore();
});
