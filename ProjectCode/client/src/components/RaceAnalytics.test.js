import { render, screen, fireEvent } from '@testing-library/react';
import RaceAnalytics, {
  timeToSeconds,
  secondsToTime,
  normalizeDistance,
} from './RaceAnalytics';
import { getResultsDistribution } from '../api/results';

jest.mock('../api/results', () => ({
  getMemberRaceResults: jest.fn(),
  getResultsDistribution: jest.fn(),
}));

const results = [
  { race: 'Spring 5K', race_date: '2023-05-07', distance: '5K', overall_time: '17:54', pace: '5:46' },
  { race: 'Spring 5K', race_date: '2024-05-05', distance: '5K', overall_time: '17:19', pace: '5:35' },
  { race: 'United NYC Half', race_date: '2024-03-17', distance: 'Half Marathon', overall_time: '1:17:03', pace: '5:53' },
  { race: 'Queens 10K', race_date: '2025-06-14', distance: '10K', overall_time: '39:37', pace: '6:23' },
];

beforeEach(() => {
  jest.clearAllMocks();
  getResultsDistribution.mockResolvedValue({
    distances: {
      'Half Marathon': [
        { runner_name: 'Fast One', time: '1:16:25', seconds: 4585 },
        { runner_name: 'Xiaoqing Guo', time: '1:17:03', seconds: 4623 },
        { runner_name: 'Slow One', time: '2:00:00', seconds: 7200 },
      ],
      '5K': [
        { runner_name: 'Xiaoqing Guo', time: '17:19', seconds: 1039 },
        { runner_name: 'Fast One', time: '16:32', seconds: 992 },
      ],
    },
  });
});

test('time helpers parse and format H:MM:SS and M:SS', () => {
  expect(timeToSeconds('1:17:03')).toBe(4623);
  expect(timeToSeconds('17:19')).toBe(1039);
  expect(timeToSeconds('05:35')).toBe(335);
  expect(timeToSeconds('bogus')).toBeNull();
  expect(timeToSeconds(null)).toBeNull();
  expect(secondsToTime(4623)).toBe('1:17:03');
  expect(secondsToTime(1039)).toBe('17:19');
  expect(secondsToTime(335)).toBe('5:35');
});

test('normalizeDistance maps NYRR labels to canonical distances', () => {
  expect(normalizeDistance('Half Marathon')).toBe('Half');
  expect(normalizeDistance('10 Mile')).toBe('10M');
  expect(normalizeDistance('5K')).toBe('5K');
  expect(normalizeDistance('Marathon')).toBe('Marathon');
});

test('renders PB progression, pace timeline and year tiles from results', () => {
  render(<RaceAnalytics results={results} memberName="Xiaoqing Guo" />);
  expect(screen.getByText('PB Progression')).toBeTruthy();
  expect(screen.getByText('All Races · Pace Timeline')).toBeTruthy();
  expect(screen.getByText('Year in Review')).toBeTruthy();
  // 2024 tile: 2 races, and the 5K + Half PRs were set that year
  expect(screen.getByText(/2 races · 2 PRs set/)).toBeTruthy();
  // PB progression defaults to a distance with 2+ years (5K) and labels both yearly bests
  expect(screen.getByText('17:54')).toBeTruthy();
  expect(screen.getAllByText('17:19').length).toBeGreaterThan(0);
});

test('club distribution flags the member dot with rank once loaded', async () => {
  render(<RaceAnalytics results={results} memberName="Xiaoqing Guo" />);
  // Default distance is Half: Guo is #2 of 3 in the fixture pool
  expect(await screen.findByText(/YOU · 1:17:03 · #2 of 3/)).toBeTruthy();
  expect(screen.getByText(/sits/)).toBeTruthy();
});

test('club distribution still highlights via PB match when the name differs', async () => {
  render(<RaceAnalytics results={results} memberName="Miles G" />);
  expect(await screen.findByText(/YOU · 1:17:03 · #2 of 3/)).toBeTruthy();
});

test('pace timeline isolates a distance when its chip is clicked', () => {
  const { container } = render(<RaceAnalytics results={results} memberName="Xiaoqing Guo" />);
  // '10K' chips exist in both PB Progression and the Pace Timeline; the
  // timeline's is the last one in render order.
  const chips = screen.getAllByText('10K');
  fireEvent.click(chips[chips.length - 1]);
  // The picked-race detail appears after clicking a dot; the 10K group stays at full opacity
  const groups = container.querySelectorAll('svg g[opacity]');
  const opacities = [...groups].map((g) => g.getAttribute('opacity'));
  expect(opacities).toContain('0.3');
  expect(opacities).toContain('1');
});
