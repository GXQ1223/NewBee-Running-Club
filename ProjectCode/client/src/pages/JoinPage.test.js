import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import JoinPage from './JoinPage';
import { submitJoinApplication } from '../api/members';
import { submitActivity } from '../api/activities';
import { getJoinRequirements } from '../api/settings';

jest.mock('../api/members', () => ({
  submitJoinApplication: jest.fn(),
}));
jest.mock('../api/activities', () => ({
  submitActivity: jest.fn(),
}));
jest.mock('../api/settings', () => ({
  getJoinRequirements: jest.fn(),
}));

// Silence the component's own console.error logging in failure-path tests
let consoleErrorSpy;

beforeEach(() => {
  jest.clearAllMocks();
  getJoinRequirements.mockResolvedValue({});
  submitJoinApplication.mockResolvedValue({ member_id: 42 });
  submitActivity.mockResolvedValue({});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ---------- helpers ----------

const renderPage = async () => {
  render(<JoinPage />);
  // flush the getJoinRequirements promise to avoid act() warnings
  await act(async () => {});
};

const getTermsBox = () =>
  screen.getByText(/Please scroll to the bottom to continue/i).parentElement
    .parentElement;

const setScrollMetrics = (el, { scrollTop, scrollHeight, clientHeight }) => {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
};

const scrollTermsToBottom = () => {
  const box = getTermsBox();
  // 1000 - 580 - 400 = 20 < 50 => considered at bottom
  setScrollMetrics(box, { scrollTop: 580, scrollHeight: 1000, clientHeight: 400 });
  fireEvent.scroll(box);
};

const agreeButton = () => screen.getByRole('button', { name: /I Agree 我同意/ });

const advancePastTerms = async () => {
  scrollTermsToBottom();
  fireEvent.click(agreeButton());
  fireEvent.click(screen.getByRole('button', { name: /^Agree 同意$/ }));
  // wait for the dialog to fully unmount so aria-hidden is removed from the
  // page root (otherwise role queries fail)
  await waitFor(() =>
    expect(screen.queryByText('Confirm Agreement 确认同意')).not.toBeInTheDocument()
  );
};

const changeField = (labelRegex, value) => {
  fireEvent.change(screen.getByLabelText(labelRegex), { target: { value } });
};

const selectLocation = (optionLabel) => {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  const listbox = within(screen.getByRole('listbox'));
  fireEvent.click(listbox.getByText(optionLabel));
};

const VALID_ENGLISH_INTRO = Array(120).fill('word').join(' ');

const fillApplicationForm = ({ includeOptionals = true, intro = VALID_ENGLISH_INTRO } = {}) => {
  changeField(/NYRR First Name/, 'Jane');
  changeField(/NYRR Last Name/, 'Doe');
  changeField(/Email 电子邮箱/, 'jane@example.com');
  changeField(/Running Experience 跑龄/, '3 years');
  selectLocation('Brooklyn 布鲁克林');
  changeField(/Weekly Running Frequency/, '4 times');
  changeField(/Monthly Mileage/, '100 miles');
  changeField(/Running Goals/, 'Marathon');
  if (includeOptionals) {
    changeField(/Nickname/, 'JD');
    changeField(/NYRR Runner ID/, '12345');
    changeField(/Race Experience/, 'NYC Half 2025');
  }
  if (intro !== null) {
    changeField(/Self Introduction/, intro);
  }
};

const submitApplication = () =>
  fireEvent.click(screen.getByRole('button', { name: /Submit 提交/ }));

const advanceToActivities = async (opts) => {
  await advancePastTerms();
  fillApplicationForm(opts);
  submitApplication();
  await screen.findByText(/Record Your Two Offline Runs with NewBee/);
};

const fillActivity = (index, { name, date, description } = {}) => {
  const nameFields = screen.getAllByLabelText(/Event Name \/ 活动名称/);
  const dateFields = screen.getAllByLabelText(/Event Date \/ 活动日期/);
  const descFields = screen.getAllByLabelText(/Description \(Optional\)/);
  if (name !== undefined) fireEvent.change(nameFields[index], { target: { value: name } });
  if (date !== undefined) fireEvent.change(dateFields[index], { target: { value: date } });
  if (description !== undefined) fireEvent.change(descFields[index], { target: { value: description } });
};

// ---------- Step 0: terms ----------

describe('Terms step', () => {
  test('renders heading, stepper, and agree button disabled before scrolling', async () => {
    await renderPage();

    expect(screen.getByText('Join NewBee Running Club')).toBeInTheDocument();
    expect(screen.getByText('Read Terms')).toBeInTheDocument();
    expect(screen.getByText('Complete Application')).toBeInTheDocument();
    expect(screen.getByText('Record Activities')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText(/Welcome to NewBee Running Club!/)).toBeInTheDocument();
    expect(agreeButton()).toBeDisabled();
  });

  test('keeps agree button disabled when scrolled but not near the bottom', async () => {
    await renderPage();

    const box = getTermsBox();
    // 1000 - 100 - 400 = 500 >= 50 => not at bottom
    setScrollMetrics(box, { scrollTop: 100, scrollHeight: 1000, clientHeight: 400 });
    fireEvent.scroll(box);

    expect(agreeButton()).toBeDisabled();
  });

  test('enables agree button after scrolling to the bottom', async () => {
    await renderPage();

    scrollTermsToBottom();

    expect(agreeButton()).toBeEnabled();
  });

  test('cancel in the confirmation dialog keeps user on the terms step', async () => {
    await renderPage();
    scrollTermsToBottom();

    fireEvent.click(agreeButton());
    expect(screen.getByText('Confirm Agreement 确认同意')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancel 取消/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Agree 同意$/ })).not.toBeInTheDocument();
    });
    // still on terms step
    expect(screen.getByText(/Welcome to NewBee Running Club!/)).toBeInTheDocument();
  });

  test('pressing Escape closes the confirmation dialog via onClose', async () => {
    await renderPage();
    scrollTermsToBottom();

    fireEvent.click(agreeButton());
    const dialogTitle = screen.getByText('Confirm Agreement 确认同意');
    fireEvent.keyDown(dialogTitle, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Confirm Agreement 确认同意')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Welcome to NewBee Running Club!/)).toBeInTheDocument();
  });

  test('agreeing in the dialog advances to the application form', async () => {
    await renderPage();

    await advancePastTerms();

    expect(screen.getByLabelText(/NYRR First Name/)).toBeInTheDocument();
    expect(screen.queryByText(/Welcome to NewBee Running Club!/)).not.toBeInTheDocument();
  });
});

// ---------- join requirements loading ----------

describe('Join requirements', () => {
  test('uses configured minimums from the API in the intro helper text', async () => {
    getJoinRequirements.mockResolvedValue({ min_english_words: 5, min_chinese_chars: 10 });
    await renderPage();
    await advancePastTerms();

    expect(
      screen.getByText(/Minimum 5 English words OR 10 Chinese characters required/)
    ).toBeInTheDocument();
  });

  test('falls back to default minimums when the requirements fetch fails', async () => {
    getJoinRequirements.mockRejectedValue(new Error('network down'));
    await renderPage();
    await advancePastTerms();

    expect(
      screen.getByText(/Minimum 120 English words OR 240 Chinese characters required/)
    ).toBeInTheDocument();
  });

  test('keeps defaults when API returns no override fields', async () => {
    getJoinRequirements.mockResolvedValue({ something_else: true });
    await renderPage();
    await advancePastTerms();

    expect(
      screen.getByText(/Minimum 120 English words OR 240 Chinese characters required/)
    ).toBeInTheDocument();
  });
});

// ---------- introduction validation ----------

describe('Introduction validation', () => {
  test('shows English word progress while typing, then valid state', async () => {
    getJoinRequirements.mockResolvedValue({ min_english_words: 5, min_chinese_chars: 10 });
    await renderPage();
    await advancePastTerms();

    changeField(/Self Introduction/, 'only two');
    expect(screen.getByText(/2\/5 English words\. Need 3 more\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit 提交/ })).toBeDisabled();

    changeField(/Self Introduction/, 'one two three four five');
    expect(screen.getByText(/Valid! 5 English words/)).toBeInTheDocument();
  });

  test('shows Chinese character progress while typing, then valid state', async () => {
    getJoinRequirements.mockResolvedValue({ min_english_words: 5, min_chinese_chars: 10 });
    await renderPage();
    await advancePastTerms();

    changeField(/Self Introduction/, '你好吗');
    expect(screen.getByText(/3\/10 Chinese characters\. Need 7 more\./)).toBeInTheDocument();

    changeField(/Self Introduction/, '我是新蜂跑团的新成员你好');
    expect(screen.getByText(/Valid! 12 Chinese characters/)).toBeInTheDocument();
  });

  test('blocks submission with an error when the introduction is empty', async () => {
    await renderPage();
    await advancePastTerms();
    fillApplicationForm({ intro: null });

    // submit the form directly (submit button is enabled because initial
    // validation state is valid until the user types)
    fireEvent.submit(document.querySelector('form'));

    expect(
      await screen.findByText(/Please complete your self-introduction with at least 120 English words/)
    ).toBeInTheDocument();
    expect(submitJoinApplication).not.toHaveBeenCalled();
  });
});

// ---------- location select ----------

describe('Location selection', () => {
  test('selecting "Other" reveals a free-text location field, switching back hides it', async () => {
    await renderPage();
    await advancePastTerms();

    selectLocation('Other 其他');
    const otherField = screen.getByLabelText(/Please specify your location/);
    expect(otherField).toBeInTheDocument();

    fireEvent.change(otherField, { target: { value: 'Boston' } });
    expect(otherField).toHaveValue('Boston');

    selectLocation('Manhattan 曼哈顿');
    expect(screen.queryByLabelText(/Please specify your location/)).not.toBeInTheDocument();
  });
});

// ---------- application submission ----------

describe('Application submission', () => {
  test('submits mapped payload with optionals and advances to activities step', async () => {
    await renderPage();
    await advancePastTerms();
    fillApplicationForm();
    submitApplication();

    await screen.findByText(/Record Your Two Offline Runs with NewBee/);

    expect(submitJoinApplication).toHaveBeenCalledWith({
      first_name: 'Jane',
      last_name: 'Doe',
      nickname: 'JD',
      email: 'jane@example.com',
      nyrr_id: '12345',
      running_experience: '3 years',
      location: 'Brooklyn 布鲁克林',
      weekly_frequency: '4 times',
      monthly_mileage: '100 miles',
      race_experience: 'NYC Half 2025',
      goals: 'Marathon',
      introduction: VALID_ENGLISH_INTRO,
    });
  });

  test('sends null for omitted optional fields', async () => {
    await renderPage();
    await advancePastTerms();
    fillApplicationForm({ includeOptionals: false });
    submitApplication();

    await screen.findByText(/Record Your Two Offline Runs with NewBee/);

    expect(submitJoinApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: null,
        nyrr_id: null,
        race_experience: null,
      })
    );
  });

  test('shows spinner while submitting and disables the form', async () => {
    let resolveSubmit;
    submitJoinApplication.mockImplementation(
      () => new Promise((resolve) => { resolveSubmit = resolve; })
    );
    await renderPage();
    await advancePastTerms();
    fillApplicationForm();
    submitApplication();

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText(/NYRR First Name/)).toBeDisabled();

    await act(async () => resolveSubmit({ member_id: 7 }));
    expect(screen.getByText(/Record Your Two Offline Runs with NewBee/)).toBeInTheDocument();
  });

  test('shows backend detail message when submission fails with error.data.detail', async () => {
    submitJoinApplication.mockRejectedValue({ data: { detail: 'Email already registered' } });
    await renderPage();
    await advancePastTerms();
    fillApplicationForm();
    submitApplication();

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
    // still on the application step
    expect(screen.getByLabelText(/NYRR First Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/NYRR First Name/)).toBeEnabled();
  });

  test('shows error.message when submission fails without detail', async () => {
    submitJoinApplication.mockRejectedValue(new Error('Network unreachable'));
    await renderPage();
    await advancePastTerms();
    fillApplicationForm();
    submitApplication();

    expect(await screen.findByText('Network unreachable')).toBeInTheDocument();
  });

  test('shows generic bilingual error for unknown error shapes', async () => {
    submitJoinApplication.mockRejectedValue({});
    await renderPage();
    await advancePastTerms();
    fillApplicationForm();
    submitApplication();

    expect(
      await screen.findByText(/Failed to submit application\. Please try again\./)
    ).toBeInTheDocument();
  });
});

// ---------- activities step ----------

describe('Activities step', () => {
  test('submits first activity, auto-switches tabs, then submits second and finishes', async () => {
    await renderPage();
    await advanceToActivities();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    fillActivity(0, {
      name: 'Central Park Group Run',
      date: '2026-07-04',
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit First Run/ }));

    // submitted card + auto-switch to second tab
    expect(await screen.findByText('Activity 1 Submitted')).toBeInTheDocument();
    expect(submitActivity).toHaveBeenCalledWith(42, {
      activity_number: 1,
      event_name: 'Central Park Group Run',
      event_date: '2026-07-04',
      description: null,
    });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/First Run \(Submitted\)/)).toBeInTheDocument();

    // only activity 2 fields remain
    fillActivity(0, {
      name: 'Track Workout',
      date: '2026-07-08',
      description: 'Ran with Bob',
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit Second Run/ }));

    expect(await screen.findByText('Activity 2 Submitted')).toBeInTheDocument();
    expect(submitActivity).toHaveBeenLastCalledWith(42, {
      activity_number: 2,
      event_name: 'Track Workout',
      event_date: '2026-07-08',
      description: 'Ran with Bob',
    });
    expect(screen.getByText('Ran with Bob')).toBeInTheDocument();

    // both submitted -> button label changes and no "submit later" caption
    const finishButton = screen.getByRole('button', { name: /Finish Application/ });
    expect(screen.queryByText(/You can submit activities later/)).not.toBeInTheDocument();

    fireEvent.click(finishButton);

    // success step with both chips marked Submitted, no warning alert
    expect(screen.getByText('Application Submitted!')).toBeInTheDocument();
    expect(screen.getByText('First Run: Submitted')).toBeInTheDocument();
    expect(screen.getByText('Second Run: Submitted')).toBeInTheDocument();
    expect(
      screen.queryByText(/You haven't submitted all required activities yet/)
    ).not.toBeInTheDocument();
  });

  test('user can manually switch between activity tabs', async () => {
    await renderPage();
    await advanceToActivities();

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tabs[0]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  test('activity submit buttons stay disabled until name and date are filled', async () => {
    await renderPage();
    await advanceToActivities();

    const submitFirst = screen.getByRole('button', { name: /Submit First Run/ });
    expect(submitFirst).toBeDisabled();

    fillActivity(0, { name: 'Morning Run' });
    expect(submitFirst).toBeDisabled();

    fillActivity(0, { date: '2026-07-01' });
    expect(submitFirst).toBeEnabled();

    // second-run panel is display:none, so include hidden elements
    expect(
      screen.getByRole('button', { name: /Submit Second Run/, hidden: true })
    ).toBeDisabled();
  });

  test('shows error when member ID is missing (application response had no member_id)', async () => {
    submitJoinApplication.mockResolvedValue({});
    await renderPage();
    await advanceToActivities();

    fillActivity(0, { name: 'Run', date: '2026-07-01' });
    fireEvent.click(screen.getByRole('button', { name: /Submit First Run/ }));

    expect(
      await screen.findByText(/Member ID not found\. Please restart the application\./)
    ).toBeInTheDocument();
    expect(submitActivity).not.toHaveBeenCalled();
  });

  test('shows backend detail when activity submission fails with data.detail', async () => {
    submitActivity.mockRejectedValue({ data: { detail: 'Duplicate activity' } });
    await renderPage();
    await advanceToActivities();

    fillActivity(0, { name: 'Run', date: '2026-07-01' });
    fireEvent.click(screen.getByRole('button', { name: /Submit First Run/ }));

    expect(await screen.findByText('Duplicate activity')).toBeInTheDocument();
    // stays on first tab, not marked submitted
    expect(screen.queryByText('Activity 1 Submitted')).not.toBeInTheDocument();
  });

  test('shows generic error when activity submission fails without detail', async () => {
    submitActivity.mockRejectedValue(new Error('boom'));
    await renderPage();
    await advanceToActivities();

    // exercise the second-activity change/submit handlers directly
    fireEvent.click(screen.getAllByRole('tab')[1]);
    fillActivity(1, { name: 'Second Run', date: '2026-07-02', description: 'hills' });
    fireEvent.click(screen.getByRole('button', { name: /Submit Second Run/ }));

    expect(
      await screen.findByText(/Failed to submit activity\. Please try again\./)
    ).toBeInTheDocument();
  });

  test('shows spinner and disables activity fields while a submission is pending', async () => {
    let resolveActivity;
    submitActivity.mockImplementation(
      () => new Promise((resolve) => { resolveActivity = resolve; })
    );
    await renderPage();
    await advanceToActivities();

    fillActivity(0, { name: 'Run', date: '2026-07-01' });
    fireEvent.click(screen.getByRole('button', { name: /Submit First Run/ }));

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Event Name \/ 活动名称/)[0]).toBeDisabled();

    await act(async () => resolveActivity({}));
    expect(screen.getByText('Activity 1 Submitted')).toBeInTheDocument();
  });
});

// ---------- success step & start over ----------

describe('Success step', () => {
  test('skipping activities shows pending chips, warning alert, and email confirmation', async () => {
    await renderPage();
    await advanceToActivities();

    fireEvent.click(screen.getByRole('button', { name: /Skip for Now/ }));

    expect(screen.getByText('Application Submitted!')).toBeInTheDocument();
    expect(screen.getByText('First Run: Not submitted')).toBeInTheDocument();
    expect(screen.getByText('Second Run: Not submitted')).toBeInTheDocument();
    expect(
      screen.getByText(/You haven't submitted all required activities yet/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
  });

  test('shows mixed chip state when only the first activity was submitted', async () => {
    await renderPage();
    await advanceToActivities();

    fillActivity(0, { name: 'Run One', date: '2026-07-01' });
    fireEvent.click(screen.getByRole('button', { name: /Submit First Run/ }));
    await screen.findByText('Activity 1 Submitted');

    fireEvent.click(screen.getByRole('button', { name: /Skip for Now/ }));

    expect(screen.getByText('First Run: Submitted')).toBeInTheDocument();
    expect(screen.getByText('Second Run: Not submitted')).toBeInTheDocument();
    expect(
      screen.getByText(/You haven't submitted all required activities yet/)
    ).toBeInTheDocument();
  });

  test('start over resets the wizard back to the terms step with a cleared form', async () => {
    await renderPage();
    await advanceToActivities();
    fireEvent.click(screen.getByRole('button', { name: /Skip for Now/ }));

    fireEvent.click(screen.getByRole('button', { name: /Submit Another Application/ }));

    // back to terms; the scrolled-to-bottom state persists (user already read
    // the terms once), so the agree button remains enabled
    expect(screen.getByText(/Welcome to NewBee Running Club!/)).toBeInTheDocument();
    expect(agreeButton()).toBeEnabled();

    // form was reset
    fireEvent.click(agreeButton());
    fireEvent.click(screen.getByRole('button', { name: /^Agree 同意$/ }));
    await waitFor(() =>
      expect(screen.queryByText('Confirm Agreement 确认同意')).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText(/NYRR First Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Email 电子邮箱/)).toHaveValue('');
  });
});
