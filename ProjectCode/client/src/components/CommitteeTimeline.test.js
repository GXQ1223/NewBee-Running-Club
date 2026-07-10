import { render, screen, fireEvent } from '@testing-library/react';
import CommitteeTimeline from './CommitteeTimeline';

const terms = [
  {
    id: '2026-2028',
    label: '2026–2028',
    label_cn: '2026–2028届',
    current: true,
    members: [
      { id: 1, name: 'Brandon Shen', position: { en: 'Board Member', zh: '委员会成员' }, image: '/Brandon Shen.png' },
      { id: 2, name: 'Shawn Tian', position: { en: 'Board Member', zh: '委员会成员' }, image: '/Shawn Tian.png' },
    ],
  },
  {
    id: '2024-2026',
    label: '2024–2026',
    label_cn: '2024–2026届',
    current: false,
    members: [
      { id: 101, name: 'Junxiao Yi', position: { en: 'Founder', zh: '创始人' }, image: '/Junxiao Yi.png' },
    ],
  },
];

test('renders one node per term with current/past pills', () => {
  render(<CommitteeTimeline terms={terms} onImageClick={() => {}} />);
  expect(screen.getByText('2026–2028')).toBeInTheDocument();
  expect(screen.getByText('2024–2026')).toBeInTheDocument();
  expect(screen.getByText('Current 现任')).toBeInTheDocument();
  expect(screen.getByText('Past 往届')).toBeInTheDocument();
});

test('current term is expanded by default, past term collapsed', () => {
  render(<CommitteeTimeline terms={terms} onImageClick={() => {}} />);
  expect(screen.getByText('Brandon Shen')).toBeVisible();
  // Past member is rendered inside a closed Collapse
  expect(screen.getByText('Junxiao Yi')).not.toBeVisible();
});

test('clicking a collapsed term expands it', () => {
  render(<CommitteeTimeline terms={terms} onImageClick={() => {}} />);
  fireEvent.click(screen.getByText('2024–2026'));
  expect(screen.getByText('Junxiao Yi')).toBeVisible();
});

test('shows member count per term', () => {
  render(<CommitteeTimeline terms={terms} onImageClick={() => {}} />);
  expect(screen.getByText('2 members')).toBeInTheDocument();
  expect(screen.getByText('1 members')).toBeInTheDocument();
});
