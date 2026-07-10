import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TrainingPage from './TrainingPage';
import { getApprovedTips, submitTip, toggleUpvote } from '../api/trainingTips';
import { getAnonymousId } from '../api/engagement';
import { useAuth } from '../context/AuthContext';

jest.mock('../api/trainingTips', () => ({
  getApprovedTips: jest.fn(),
  submitTip: jest.fn(),
  toggleUpvote: jest.fn(),
}));
jest.mock('../api/engagement', () => ({ getAnonymousId: jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const tips = [
  {
    id: 1,
    category: 'recovery',
    title: 'Stretch More',
    title_cn: '多拉伸',
    content: 'Stretch daily after runs',
    content_cn: '跑后每天拉伸',
    author_name: 'Alice',
    upvotes: 5,
    user_upvoted: false,
    video_url: 'https://www.youtube.com/watch?v=abc123&t=5',
    video_platform: 'youtube',
  },
  {
    id: 2,
    category: 'nutrition',
    title: 'Eat Carbs',
    content: 'Carbs before long runs',
    author_name: null,
    upvotes: 2,
    user_upvoted: true,
    video_url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    video_platform: 'bilibili',
  },
  {
    id: 3,
    category: 'gear',
    title: 'Good Shoes',
    content: 'Replace shoes every 400 miles',
    upvotes: 0,
    user_upvoted: false,
  },
  {
    id: 4,
    category: 'technique',
    title: 'Short Link Tip',
    content: 'Video via short link',
    upvotes: 1,
    user_upvoted: false,
    video_url: 'https://youtu.be/xyz789?t=1',
    video_platform: 'youtube',
  },
  {
    id: 5,
    category: 'mental',
    title: 'Embed Tip',
    content: 'Video via embed url',
    upvotes: 1,
    user_upvoted: false,
    video_url: 'https://www.youtube.com/embed/qqq?rel=0',
    video_platform: 'youtube',
  },
];

const renderTraining = (entry = '/training') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/training/ai" element={<TrainingPage />} />
        <Route path="/training/community" element={<TrainingPage />} />
        <Route path="/training/routes" element={<TrainingPage />} />
      </Routes>
    </MemoryRouter>
  );

// Wait for the tips fetch (fired on mount for every route) to fully settle so
// its setState lands inside the test.
const settleTips = async () => {
  await waitFor(() => expect(getApprovedTips).toHaveBeenCalled());
  await act(async () => {});
};

// MUI Select triggers are not label-associated inputs; open by combobox role.
const selectOption = (comboIndex, optionName) => {
  fireEvent.mouseDown(screen.getAllByRole('combobox')[comboIndex]);
  fireEvent.click(screen.getByRole('option', { name: optionName }));
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
  getAnonymousId.mockReturnValue('anon-1');
  getApprovedTips.mockResolvedValue(tips);
});

test('renders feature cards and card clicks navigate between sections', async () => {
  renderTraining('/training');
  await settleTips();

  expect(screen.getByText('Training with Us')).toBeInTheDocument();
  expect(screen.getByText('AI Training Partner')).toBeInTheDocument();
  expect(screen.getByText('Custom Plans')).toBeInTheDocument();
  expect(screen.getByText('Community')).toBeInTheDocument();
  expect(screen.getByText('NYC Routes')).toBeInTheDocument();

  // Generator visible on /training
  expect(screen.getByText('Our Training Philosophy')).toBeInTheDocument();

  // Navigate to community
  fireEvent.click(screen.getByText('Community'));
  expect(await screen.findByText('Community Training Tips')).toBeInTheDocument();
  expect(screen.queryByText('Our Training Philosophy')).not.toBeInTheDocument();

  // Navigate to routes
  fireEvent.click(screen.getByText('NYC Routes'));
  expect(await screen.findByText('Popular NYC Running Routes')).toBeInTheDocument();

  // Navigate back to the AI generator via the AI card, then the Custom Plans card
  fireEvent.click(screen.getByText('AI Training Partner'));
  expect(await screen.findByText('Our Training Philosophy')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Custom Plans'));
  expect(await screen.findByText('Our Training Philosophy')).toBeInTheDocument();
});

test('routes section renders popular routes with chips', async () => {
  renderTraining('/training/routes');
  await settleTips();

  expect(screen.getByText('Central Park Loop')).toBeInTheDocument();
  expect(screen.getByText('Brooklyn Bridge Run')).toBeInTheDocument();
  expect(screen.getByText('Prospect Park Hills')).toBeInTheDocument();
  expect(screen.getByText('6.1 mi')).toBeInTheDocument();
  expect(screen.getByText('Easy')).toBeInTheDocument();
  expect(screen.getByText('4.8 stars')).toBeInTheDocument();
});

test('tips list renders with category chips, upvote counts, and authors', async () => {
  renderTraining('/training/community');

  expect(await screen.findByText('Stretch More')).toBeInTheDocument();
  expect(screen.getByText('多拉伸')).toBeInTheDocument();
  expect(screen.getByText('recovery')).toBeInTheDocument();
  expect(screen.getByText('nutrition')).toBeInTheDocument();
  expect(screen.getByText('gear')).toBeInTheDocument();
  expect(screen.getByText('5 upvotes')).toBeInTheDocument();
  expect(screen.getByText('Shared by Alice')).toBeInTheDocument();
  expect(screen.getAllByText('Shared by Anonymous').length).toBeGreaterThanOrEqual(1);
  expect(getApprovedTips).toHaveBeenCalledWith(null, 'anon-1', 'u1');
});

test('upvote calls API and updates count', async () => {
  toggleUpvote.mockResolvedValue({ upvotes: 6, user_upvoted: true });
  renderTraining('/training/community');
  await screen.findByText('Stretch More');

  // First tip is not upvoted -> outlined icon
  fireEvent.click(screen.getAllByTestId('ThumbUpOutlinedIcon')[0].closest('button'));

  await waitFor(() => expect(toggleUpvote).toHaveBeenCalledWith(1, 'anon-1', 'u1'));
  expect(await screen.findByText('6 upvotes')).toBeInTheDocument();
});

test('upvote API failure leaves counts unchanged', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  toggleUpvote.mockRejectedValue(new Error('nope'));
  renderTraining('/training/community');
  await screen.findByText('Stretch More');

  fireEvent.click(screen.getAllByTestId('ThumbUpOutlinedIcon')[0].closest('button'));
  await waitFor(() => expect(toggleUpvote).toHaveBeenCalled());
  expect(screen.getByText('5 upvotes')).toBeInTheDocument();
  errSpy.mockRestore();
});

test('video embeds render for youtube, short-link, embed, and bilibili urls', async () => {
  renderTraining('/training/community');
  await screen.findByText('Stretch More');

  // Expand tip 1 (youtube watch?v=)
  fireEvent.click(screen.getAllByRole('button', { name: 'Watch Video' })[0]);
  expect(screen.getByTitle('Stretch More')).toHaveAttribute(
    'src',
    'https://www.youtube.com/embed/abc123'
  );

  // Expand tip 2 (bilibili) - collapses tip 1
  fireEvent.click(screen.getAllByRole('button', { name: 'Watch Video' })[0]);
  expect(screen.getByTitle('Eat Carbs')).toHaveAttribute(
    'src',
    'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&high_quality=1'
  );
  expect(screen.queryByTitle('Stretch More')).not.toBeInTheDocument();

  // Expand tip 4 (youtu.be short link)
  fireEvent.click(screen.getAllByRole('button', { name: 'Watch Video' })[1]);
  expect(screen.getByTitle('Short Link Tip')).toHaveAttribute(
    'src',
    'https://www.youtube.com/embed/xyz789'
  );

  // Expand tip 5 (embed/ url)
  fireEvent.click(screen.getAllByRole('button', { name: 'Watch Video' })[2]);
  expect(screen.getByTitle('Embed Tip')).toHaveAttribute(
    'src',
    'https://www.youtube.com/embed/qqq'
  );
});

test('tips fetch failure falls back to sample tips with dismissible warning', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  getApprovedTips.mockRejectedValue(new Error('api down'));
  renderTraining('/training/community');

  expect(
    await screen.findByText('Unable to load tips from server. Showing sample tips.')
  ).toBeInTheDocument();
  expect(screen.getByText('Post-Run Stretching Routine')).toBeInTheDocument();
  expect(screen.getByText('Race Day Breakfast')).toBeInTheDocument();

  // Dismiss the warning
  const warning = screen
    .getByText('Unable to load tips from server. Showing sample tips.')
    .closest('.MuiAlert-root');
  fireEvent.click(warning.querySelector('button'));
  await waitFor(() =>
    expect(
      screen.queryByText('Unable to load tips from server. Showing sample tips.')
    ).not.toBeInTheDocument()
  );
  errSpy.mockRestore();
});

test('empty tips list shows the empty message', async () => {
  getApprovedTips.mockResolvedValue([]);
  renderTraining('/training/community');

  expect(await screen.findByText(/No tips available yet/)).toBeInTheDocument();
});

test('submit-tip dialog validates required fields and saves', async () => {
  submitTip.mockResolvedValue({});
  renderTraining('/training/community');
  await screen.findByText('Stretch More');

  fireEvent.click(screen.getByRole('button', { name: 'Submit a Tip' }));
  expect(screen.getByText('Submit a Training Tip / 提交训练技巧')).toBeInTheDocument();

  const submitButton = screen.getByRole('button', { name: 'Submit' });
  expect(submitButton).toBeDisabled();

  // Fill required fields one by one; still disabled until all three set
  const dialog = screen.getByRole('dialog');
  fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Recovery / 恢复' }));
  expect(submitButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Title \(English\)/), { target: { value: 'Hydrate' } });
  expect(submitButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Content \(English\)/), {
    target: { value: 'Drink water on long runs' },
  });
  expect(submitButton).toBeEnabled();

  fireEvent.click(submitButton);
  await waitFor(() =>
    expect(submitTip).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'recovery',
        title: 'Hydrate',
        content: 'Drink water on long runs',
      }),
      'u1'
    )
  );
  const successAlerts = (await screen.findAllByText(/Tip submitted successfully/)).map((el) =>
    el.closest('.MuiAlert-root')
  );
  expect(successAlerts.length).toBeGreaterThanOrEqual(1);

  // Dismiss the page-level success alert (the one with a close button)
  const dismissible = successAlerts.find((a) => a.querySelector('button'));
  fireEvent.click(dismissible.querySelector('button'));

  // Dialog reverted to the (reset) form; cancel it
  expect(screen.getByLabelText(/Title \(English\)/)).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.queryByText('Submit a Training Tip / 提交训练技巧')).not.toBeInTheDocument()
  );
});

test('submit-tip failure shows an error', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  submitTip.mockRejectedValue(new Error('nope'));
  renderTraining('/training/community');
  await screen.findByText('Stretch More');

  fireEvent.click(screen.getByRole('button', { name: 'Submit a Tip' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Gear / 装备' }));
  fireEvent.change(screen.getByLabelText(/Title \(English\)/), { target: { value: 'T' } });
  fireEvent.change(screen.getByLabelText(/Content \(English\)/), { target: { value: 'C' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  expect(await screen.findByText('Failed to submit tip. Please try again.')).toBeInTheDocument();
  errSpy.mockRestore();
});

test('plan generator stepper: full pass with next/back navigation', async () => {
  renderTraining('/training/ai');
  await settleTips();

  // Step 0: introduction, Next enabled
  expect(screen.getByText('Our Training Philosophy')).toBeInTheDocument();
  const next = () => screen.getByRole('button', { name: /Next \/ 下一步/ });
  expect(next()).toBeEnabled();
  fireEvent.click(next());

  // Step 1: race info required
  expect(next()).toBeDisabled();
  selectOption(0, 'Half Marathon');
  expect(next()).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Target Time/), { target: { value: '01:45:00' } });
  expect(next()).toBeEnabled();
  fireEvent.click(next());

  // Step 2: at least one current time required
  expect(next()).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/5K Time/), { target: { value: '00:25:00' } });
  expect(next()).toBeEnabled();

  // Back keeps entered data
  fireEvent.click(screen.getByRole('button', { name: /Back \/ 返回/ }));
  expect(screen.getByLabelText(/Target Time/)).toHaveValue('01:45:00');
  fireEvent.click(next());
  expect(screen.getByLabelText(/5K Time/)).toHaveValue('00:25:00');
  fireEvent.click(next());

  // Step 3: duration required, then generate
  const generate = () => screen.getByRole('button', { name: /Generate Plan/ });
  expect(generate()).toBeDisabled();
  selectOption(0, '12 Weeks');
  expect(generate()).toBeEnabled();
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  fireEvent.click(generate());
  logSpy.mockRestore();

  // Plan summary
  expect(screen.getByText(/Coming Soon!/)).toBeInTheDocument();
  expect(screen.getByText('Half Marathon')).toBeInTheDocument();
  expect(screen.getByText('01:45:00')).toBeInTheDocument();
  expect(screen.getByText('12 Weeks')).toBeInTheDocument();

  // Start over resets the wizard
  fireEvent.click(screen.getByRole('button', { name: /Start Over/ }));
  expect(screen.getByText('Our Training Philosophy')).toBeInTheDocument();
  fireEvent.click(next());
  expect(screen.getByRole('button', { name: /Next \/ 下一步/ })).toBeDisabled();
});
