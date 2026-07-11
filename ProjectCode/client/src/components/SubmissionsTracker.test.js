import { render, screen, fireEvent } from '@testing-library/react';
import SubmissionsTracker from './SubmissionsTracker';

const pending = {
  id: 11, race_name: 'Jersey City Half', race_date: '2026-06-28', race_distance: 'Half Marathon',
  finish_time: '1:36:40', proof_url: 'https://jch/results', status: 'pending', review_note: null,
};
const approved = {
  id: 12, race_name: 'Boston Marathon', race_date: '2026-04-20', race_distance: 'Marathon',
  finish_time: '3:25:58', proof_url: null, status: 'approved', review_note: null,
};
const rejected = {
  id: 13, race_name: 'Backyard Ultra', race_date: '2025-10-01', race_distance: '50K',
  finish_time: '5:00:00', proof_url: null, status: 'rejected', review_note: 'no proof attached',
};

const onEdit = jest.fn();
const onWithdraw = jest.fn();

beforeEach(() => jest.clearAllMocks());

const renderTracker = (submissions) =>
  render(<SubmissionsTracker submissions={submissions} onEdit={onEdit} onWithdraw={onWithdraw} />);

test('renders nothing when there are no submissions', () => {
  const { container } = renderTracker([]);
  expect(container).toBeEmptyDOMElement();
  const { container: c2 } = render(
    <SubmissionsTracker submissions={null} onEdit={onEdit} onWithdraw={onWithdraw} />
  );
  expect(c2).toBeEmptyDOMElement();
});

test('pending submission shows in-review status, proof link and edit/withdraw', () => {
  renderTracker([pending]);

  expect(screen.getByText('Jersey City Half')).toBeInTheDocument();
  expect(screen.getByText('1:36:40')).toBeInTheDocument();
  expect(screen.getByText(/In review 审核中/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /official results/ })).toHaveAttribute('href', 'https://jch/results');
  // Step 2 (committee review) is the active step
  expect(screen.getByText(/Committee Review/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Edit 编辑/ }));
  expect(onEdit).toHaveBeenCalledWith(pending);
  fireEvent.click(screen.getByRole('button', { name: /Withdraw 撤回/ }));
  expect(onWithdraw).toHaveBeenCalledWith(pending);
});

test('approved submission shows all steps done and no edit buttons', () => {
  renderTracker([approved]);

  expect(screen.getByText(/On Leaderboard 已上榜/)).toBeInTheDocument();
  expect(screen.getByText(/visible on the club Records page/)).toBeInTheDocument();
  expect(screen.getByText(/No proof link attached/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument();
});

test('rejected submission shows the note and edit & resubmit', () => {
  renderTracker([rejected]);

  // Chip + step label both read "Rejected 已拒绝"
  expect(screen.getAllByText(/Rejected 已拒绝/).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/no proof attached/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Edit & resubmit/ }));
  expect(onEdit).toHaveBeenCalledWith(rejected);
});

test('renders one card per submission', () => {
  renderTracker([pending, approved, rejected]);
  expect(screen.getAllByTestId('submission-card')).toHaveLength(3);
});
