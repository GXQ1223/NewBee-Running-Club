import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecordWall, { distanceToMeters } from './RecordWall';
import html2canvas from 'html2canvas';

jest.mock('html2canvas', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const prEntries = [
  { distance: '5K', time: '0:20:00', race: 'Alpha 5K', date: '2024-01-01', pace: '6:26', resultId: 1, photoUrl: null, onLeaderboard: false, photoTarget: { type: 'result', id: 1 } },
  { distance: 'Marathon', time: '3:25:58', race: 'Boston Marathon', date: '2026-04-20', pace: '7:52', resultId: 4, photoUrl: 'https://img/boston.jpg', onLeaderboard: true, photoTarget: { type: 'submission', id: 12 } },
];

const pendingEntries = [
  { distance: 'Half Marathon', time: '1:36:40', race: 'Jersey City Half', date: '2026-06-28', pace: '07:23', pending: true, submissionId: 11, photoUrl: null, photoTarget: { type: 'submission', id: 11 } },
];

const defaultProps = {
  memberName: 'Speedy',
  memberNameCn: '飞毛腿',
  totalRaces: 8,
  prEntries,
  pendingEntries,
  onAddRecord: jest.fn(),
  onChangePhoto: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  html2canvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,MOCK' });
});

describe('distanceToMeters', () => {
  test('parses known distance formats', () => {
    expect(distanceToMeters('Marathon')).toBe(42195);
    expect(distanceToMeters('Half Marathon')).toBe(21097.5);
    expect(distanceToMeters('5K')).toBe(5000);
    expect(distanceToMeters('10 km')).toBe(10000);
    expect(distanceToMeters('10M')).toBeCloseTo(16093.4);
    expect(distanceToMeters('4 miles')).toBeCloseTo(6437.36);
    expect(distanceToMeters('8.5')).toBe(8500);
    expect(distanceToMeters('weird')).toBe(0);
    expect(distanceToMeters('')).toBe(0);
    expect(distanceToMeters(null)).toBe(0);
  });
});

test('renders plaques longest distance first with featured styling and chips', () => {
  render(<RecordWall {...defaultProps} />);

  const plaques = screen.getAllByTestId('medal-plaque');
  expect(plaques).toHaveLength(3); // 2 PRs + 1 pending
  // Marathon (longest) is first and featured
  expect(plaques[0]).toHaveTextContent('Marathon'); // uppercased via CSS
  expect(plaques[0]).toHaveTextContent('3:25:58');
  expect(plaques[0]).toHaveTextContent('🏆');
  expect(plaques[0]).toHaveTextContent('On Leaderboard 已上榜');
  // 5K second, NYRR chip
  expect(plaques[1]).toHaveTextContent('0:20:00');
  expect(plaques[1]).toHaveTextContent('NYRR Synced');
  // Pending plaque last
  expect(plaques[2]).toHaveTextContent('Jersey City Half');
  expect(plaques[2]).toHaveTextContent('Pending Review 待审核');
  // No-photo hint appears on plaques without a photo
  expect(screen.getAllByText(/Add your race photo/).length).toBe(2);
});

test('empty wall shows the waiting message and disables export buttons', () => {
  render(<RecordWall {...defaultProps} prEntries={[]} pendingEntries={[]} />);
  expect(screen.getByText(/Your wall is waiting for its first medal/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Save as Image/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Print/ })).toBeDisabled();
});

test('add-record plaque and photo buttons invoke callbacks', () => {
  render(<RecordWall {...defaultProps} />);

  fireEvent.click(screen.getByTestId('add-record-plaque'));
  expect(defaultProps.onAddRecord).toHaveBeenCalled();

  fireEvent.click(screen.getAllByRole('button', { name: /Add 添加|Change 更换/ })[0]);
  expect(defaultProps.onChangePhoto).toHaveBeenCalledWith(
    expect.objectContaining({ distance: 'Marathon' })
  );
});

test('poster mode adds framed header/footer and hides editing affordances', () => {
  render(<RecordWall {...defaultProps} />);

  fireEvent.click(screen.getByRole('button', { name: /Poster Mode/ }));
  expect(screen.getByText('Speedy')).toBeInTheDocument();
  expect(screen.getByText(/· 飞毛腿/)).toBeInTheDocument();
  expect(screen.getByText(/MY RECORD WALL 我的纪录墙 · 8 RACES/)).toBeInTheDocument();
  expect(screen.getByText(/NEWBEERUNNINGCLUB.ORG/)).toBeInTheDocument();
  // No add plaque or camera buttons in poster mode
  expect(screen.queryByTestId('add-record-plaque')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add 添加|Change 更换/ })).not.toBeInTheDocument();

  // Toggle back off
  fireEvent.click(screen.getByRole('button', { name: /Poster Mode/ }));
  expect(screen.queryByText(/NEWBEERUNNINGCLUB.ORG/)).not.toBeInTheDocument();
  expect(screen.getByTestId('add-record-plaque')).toBeInTheDocument();
});

test('save as image renders the wall to a canvas and downloads it', async () => {
  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<RecordWall {...defaultProps} />);

  fireEvent.click(screen.getByRole('button', { name: /Save as Image/ }));

  await waitFor(() => expect(html2canvas).toHaveBeenCalledWith(
    screen.getByTestId('record-wall'),
    expect.objectContaining({ useCORS: true, scale: 2 })
  ));
  await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  clickSpy.mockRestore();
});

test('save as image failure shows an error alert', async () => {
  html2canvas.mockRejectedValueOnce(new Error('canvas boom'));
  render(<RecordWall {...defaultProps} />);

  fireEvent.click(screen.getByRole('button', { name: /Save as Image/ }));
  expect(await screen.findByText(/Failed to export image/)).toBeInTheDocument();
});

test('print renders the wall into a new window', async () => {
  const write = jest.fn();
  const close = jest.fn();
  const openSpy = jest.spyOn(window, 'open').mockReturnValue({ document: { write, close } });
  render(<RecordWall {...defaultProps} />);

  fireEvent.click(screen.getByRole('button', { name: /Print/ }));

  await waitFor(() => expect(write).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,MOCK')));
  expect(close).toHaveBeenCalled();
  openSpy.mockRestore();
});

test('print tolerates a blocked popup and canvas failure', async () => {
  const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
  render(<RecordWall {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: /Print/ }));
  await waitFor(() => expect(html2canvas).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole('button', { name: /Print/ })).toBeEnabled());

  html2canvas.mockRejectedValueOnce(new Error('boom'));
  fireEvent.click(screen.getByRole('button', { name: /Print/ }));
  expect(await screen.findByText(/Failed to prepare print view/)).toBeInTheDocument();
  openSpy.mockRestore();
});
