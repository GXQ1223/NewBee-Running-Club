import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';
import { committeeTerms } from '../data/committeeMembers';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getMeetingFiles, getMeetingContent } from '../api/meetings';
import {
  getAllMeetingMinutes,
  createMeetingMinutes,
  updateMeetingMinutes,
  deleteMeetingMinutes
} from '../api/meetingMinutes';

let mockTimelineProps = null;

// The repo's custom transformIgnorePatterns stops CRA's css transform from
// processing node_modules css, so stub the quill stylesheet import directly.
jest.mock('react-quill/dist/quill.snow.css', () => ({}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/AdminContext', () => ({ useAdmin: jest.fn() }));
jest.mock('../api/meetings', () => ({
  getMeetingFiles: jest.fn(),
  getMeetingContent: jest.fn(),
}));
jest.mock('../api/meetingMinutes', () => ({
  getAllMeetingMinutes: jest.fn(),
  createMeetingMinutes: jest.fn(),
  updateMeetingMinutes: jest.fn(),
  deleteMeetingMinutes: jest.fn(),
}));
let mockAutoFillOptions = null;
jest.mock('../hooks', () => ({
  useAutoFillOnTab: (options) => {
    mockAutoFillOptions = options;
    return jest.fn();
  },
}));
// Probe: capture props passed to the heavy CommitteeTimeline child
jest.mock('../components/CommitteeTimeline', () => {
  const React = require('react');
  return function MockCommitteeTimeline(props) {
    mockTimelineProps = props;
    return React.createElement(
      'div',
      { 'data-testid': 'committee-timeline' },
      React.createElement(
        'button',
        { onClick: () => props.onImageClick('/probe-member.png') },
        'probe-open-image'
      )
    );
  };
});

const dbMeetings = [
  { id: 11, title: 'January Committee Meeting', meeting_date: '2026-01-10', content: '<p>Budget discussion</p>' },
  { id: 12, title: 'March Committee Meeting', meeting_date: '2026-03-05', content: '<h2>Agenda</h2><p>Race planning</p>' },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockTimelineProps = null;
  useAuth.mockReturnValue({ currentUser: { uid: 'admin-uid' } });
  useAdmin.mockReturnValue({ adminModeEnabled: false });
  getMeetingFiles.mockReturnValue([]);
  getMeetingContent.mockResolvedValue('');
  getAllMeetingMinutes.mockResolvedValue(dbMeetings);
  createMeetingMinutes.mockResolvedValue({ id: 99 });
  updateMeetingMinutes.mockResolvedValue({});
  deleteMeetingMinutes.mockResolvedValue({});
  global.fetch = jest.fn().mockResolvedValue({
    text: () => Promise.resolve('# Election Standards\n\n- Rule one\n- Rule two'),
  });
});

describe('history and committee sections', () => {
  test('renders history headers, story text and photo captions', async () => {
    renderPage();
    expect(screen.getByText("NewBee's History")).toBeInTheDocument();
    expect(screen.getByText('新蜂历史')).toBeInTheDocument();
    expect(screen.getByText(/NewBee Running Club was founded in 2016/)).toBeInTheDocument();
    expect(screen.getByAltText('NewBee History 1')).toBeInTheDocument();
    expect(screen.getByAltText('NewBee History 2')).toBeInTheDocument();
    expect(screen.getByAltText('NewBee History 3')).toBeInTheDocument();
    expect(screen.getByText(/Early Days of 2016/)).toBeInTheDocument();
    expect(screen.getByText('Board of Committee')).toBeInTheDocument();
    await waitFor(() => expect(getAllMeetingMinutes).toHaveBeenCalled());
  });

  test('passes committeeTerms and an image click handler to CommitteeTimeline', async () => {
    renderPage();
    expect(screen.getByTestId('committee-timeline')).toBeInTheDocument();
    expect(mockTimelineProps.terms).toBe(committeeTerms);
    expect(typeof mockTimelineProps.onImageClick).toBe('function');
    await screen.findByText('January Committee Meeting');
  });

  test('image modal opens from timeline click and closes on click', async () => {
    renderPage();
    fireEvent.click(screen.getByText('probe-open-image'));
    const img = await screen.findByAltText('Enlarged Committee Member');
    expect(img).toHaveAttribute('src', '/probe-member.png');
    fireEvent.click(img);
    await waitFor(() =>
      expect(screen.queryByAltText('Enlarged Committee Member')).not.toBeInTheDocument()
    );
  });

  test('election standards accordion shows fetched markdown after loading', async () => {
    renderPage();
    expect(screen.getByText('Committee Election Standards')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Committee Election Standards'));
    expect(await screen.findByText('Rule one')).toBeInTheDocument();
    expect(screen.getByText('Rule two')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/data/committee/election_standards.md');
  });

  test('election standards fetch failure stops loading gracefully', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    renderPage();
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    await screen.findByText('January Committee Meeting');
  });
});

describe('meeting minutes list', () => {
  test('renders db meetings sorted by date and expands to show content', async () => {
    renderPage();
    const march = await screen.findByText('March Committee Meeting');
    expect(screen.getByText('January Committee Meeting')).toBeInTheDocument();
    expect(screen.getByText('March 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('January 10, 2026')).toBeInTheDocument();
    fireEvent.click(march);
    expect(await screen.findByText('Race planning')).toBeInTheDocument();
  });

  test('shows empty state when there are no meetings', async () => {
    getAllMeetingMinutes.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No meeting minutes available.')).toBeInTheDocument();
  });

  test('renders local markdown meetings with (Local file) badge and skips broken files', async () => {
    getMeetingFiles.mockReturnValue(['2024-02-14.md', 'bad.md']);
    getMeetingContent.mockImplementation((filename) =>
      filename === 'bad.md'
        ? Promise.reject(new Error('missing'))
        : Promise.resolve('# Old Notes\n\nSome legacy content')
    );
    renderPage();
    // Title appears in the accordion summary and in the rendered markdown h1
    expect((await screen.findAllByText('Old Notes')).length).toBeGreaterThan(0);
    expect(screen.getByText('(Local file)')).toBeInTheDocument();
    expect(screen.getByText('February 14, 2024')).toBeInTheDocument();
  });

  test('falls back to local files when db fetch fails', async () => {
    getAllMeetingMinutes.mockRejectedValue(new Error('api down'));
    getMeetingFiles.mockReturnValue(['2023-05-01.md', 'bad.md']);
    getMeetingContent.mockImplementation((filename) =>
      filename === 'bad.md'
        ? Promise.reject(new Error('missing'))
        : Promise.resolve('# Fallback Notes\n\nfallback body')
    );
    renderPage();
    expect((await screen.findAllByText('Fallback Notes')).length).toBeGreaterThan(0);
    expect(screen.queryByText('March Committee Meeting')).not.toBeInTheDocument();
  });

  test('shows empty state when db fails and local files also error', async () => {
    getAllMeetingMinutes.mockRejectedValue(new Error('api down'));
    getMeetingFiles.mockImplementation(() => {
      throw new Error('fs error');
    });
    renderPage();
    expect(await screen.findByText('No meeting minutes available.')).toBeInTheDocument();
  });
});

describe('admin gating', () => {
  test('non-admin sees no add/edit/delete affordances', async () => {
    renderPage();
    await screen.findByText('January Committee Meeting');
    expect(screen.queryByText('Add Meeting Minutes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('EditIcon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  test('admin sees add button and per-meeting edit/delete buttons for db entries only', async () => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
    getMeetingFiles.mockReturnValue(['2024-02-14.md']);
    getMeetingContent.mockResolvedValue('# Old Notes\n\nlegacy');
    renderPage();
    await screen.findByText('January Committee Meeting');
    await screen.findAllByText('Old Notes');
    expect(screen.getByText('Add Meeting Minutes')).toBeInTheDocument();
    // 2 db meetings get edit + delete buttons; the local file gets none
    expect(screen.getAllByTestId('EditIcon')).toHaveLength(2);
    expect(screen.getAllByTestId('DeleteIcon')).toHaveLength(2);
  });
});

describe('admin add/edit/save', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('add flow validates title, date, and content before saving', async () => {
    renderPage();
    await screen.findByText('January Committee Meeting');
    fireEvent.click(screen.getByText('Add Meeting Minutes'));
    expect(screen.getByText('New Meeting Minutes / 新会议纪要')).toBeInTheDocument();

    // Missing title
    fireEvent.click(screen.getByText('Save / 保存'));
    expect(await screen.findByText(/Please enter a title/)).toBeInTheDocument();

    // Missing date
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'April Meeting' } });
    fireEvent.change(screen.getByLabelText(/Meeting Date/), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save / 保存'));
    expect(await screen.findByText(/Please select a meeting date/)).toBeInTheDocument();

    // Missing content (quill's empty paragraph counts as empty)
    fireEvent.change(screen.getByLabelText(/Meeting Date/), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByTestId('quill-editor'), { target: { value: '<p><br></p>' } });
    fireEvent.click(screen.getByText('Save / 保存'));
    expect(await screen.findByText(/Please enter meeting minutes content/)).toBeInTheDocument();
    expect(createMeetingMinutes).not.toHaveBeenCalled();

    // Valid save
    fireEvent.change(screen.getByTestId('quill-editor'), { target: { value: '<p>Notes body</p>' } });
    fireEvent.click(screen.getByText('Save / 保存'));
    await waitFor(() =>
      expect(createMeetingMinutes).toHaveBeenCalledWith(
        { title: 'April Meeting', meeting_date: '2026-04-01', content: '<p>Notes body</p>' },
        'admin-uid'
      )
    );
    expect(await screen.findByText(/created successfully/)).toBeInTheDocument();
    // Editor closes after save
    expect(screen.queryByText('New Meeting Minutes / 新会议纪要')).not.toBeInTheDocument();
    // List was refetched
    expect(getAllMeetingMinutes).toHaveBeenCalledTimes(2);
  });

  test('cancel closes the editor without saving', async () => {
    renderPage();
    await screen.findByText('January Committee Meeting');
    fireEvent.click(screen.getByText('Add Meeting Minutes'));
    // Tab auto-fill wiring: the hook's setValue updates the form field
    act(() => mockAutoFillOptions.setValue('title', 'Auto Title'));
    expect(screen.getByLabelText(/Title/)).toHaveValue('Auto Title');
    fireEvent.click(screen.getByText('Cancel / 取消'));
    expect(screen.queryByText('New Meeting Minutes / 新会议纪要')).not.toBeInTheDocument();
    expect(createMeetingMinutes).not.toHaveBeenCalled();
  });

  test('edit flow pre-fills the form and updates the meeting', async () => {
    renderPage();
    await screen.findByText('March Committee Meeting');
    // Meetings sorted desc: first edit icon belongs to March meeting
    fireEvent.click(screen.getAllByTestId('EditIcon')[0].closest('button'));
    expect(screen.getByText('Edit Meeting Minutes / 编辑会议纪要')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toHaveValue('March Committee Meeting');
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'March Meeting (rev)' } });
    fireEvent.click(screen.getByText('Save / 保存'));
    await waitFor(() =>
      expect(updateMeetingMinutes).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ title: 'March Meeting (rev)', meeting_date: '2026-03-05' }),
        'admin-uid'
      )
    );
    expect(await screen.findByText(/updated successfully/)).toBeInTheDocument();
  });

  test('shows an error alert when saving fails', async () => {
    createMeetingMinutes.mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('January Committee Meeting');
    fireEvent.click(screen.getByText('Add Meeting Minutes'));
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Broken Save' } });
    fireEvent.change(screen.getByTestId('quill-editor'), { target: { value: '<p>x</p>' } });
    fireEvent.click(screen.getByText('Save / 保存'));
    expect(await screen.findByText(/Failed to save meeting minutes/)).toBeInTheDocument();
    // Editor stays open for retry
    expect(screen.getByText('New Meeting Minutes / 新会议纪要')).toBeInTheDocument();
    // Dismiss the error alert
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to save meeting minutes/)).not.toBeInTheDocument()
    );
  });
});

describe('admin delete', () => {
  beforeEach(() => {
    useAdmin.mockReturnValue({ adminModeEnabled: true });
  });

  test('delete flow confirms and calls the api', async () => {
    renderPage();
    await screen.findByText('March Committee Meeting');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Delete Meeting Minutes\?/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/March Committee Meeting/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    await waitFor(() => expect(deleteMeetingMinutes).toHaveBeenCalledWith(12, 'admin-uid'));
    expect(await screen.findByText(/deleted successfully/)).toBeInTheDocument();
    // Dismiss the success alert
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/deleted successfully/)).not.toBeInTheDocument()
    );
  });

  test('cancel in delete dialog does not delete', async () => {
    renderPage();
    await screen.findByText('March Committee Meeting');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel / 取消'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteMeetingMinutes).not.toHaveBeenCalled();
  });

  test('shows an error alert when delete fails', async () => {
    deleteMeetingMinutes.mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findByText('March Committee Meeting');
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[0].closest('button'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Delete / 删除'));
    expect(await screen.findByText(/Failed to delete meeting minutes/)).toBeInTheDocument();
  });
});
