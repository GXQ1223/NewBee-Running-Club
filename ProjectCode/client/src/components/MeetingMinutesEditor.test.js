import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MeetingMinutesEditor from './MeetingMinutesEditor';
import {
  getAllMeetingMinutes,
  createMeetingMinutes,
  updateMeetingMinutes,
  deleteMeetingMinutes,
} from '../api/meetingMinutes';

jest.mock('../api/meetingMinutes', () => ({
  getAllMeetingMinutes: jest.fn(),
  createMeetingMinutes: jest.fn(),
  updateMeetingMinutes: jest.fn(),
  deleteMeetingMinutes: jest.fn(),
}));

const MINUTES = [
  {
    id: 1,
    title: 'January Committee Meeting',
    meeting_date: '2026-01-15',
    content: '<p>Discussed <strong>budget</strong></p><script>alert("xss")</script>',
    created_by: 'Alice',
  },
  {
    id: 2,
    title: 'February Committee Meeting',
    meeting_date: '2026-02-10',
    content: '<p>Race planning</p>',
  },
];

async function renderEditor() {
  const utils = render(<MeetingMinutesEditor firebaseUid="uid-1" />);
  await waitFor(() => expect(getAllMeetingMinutes).toHaveBeenCalled());
  return utils;
}

async function openNewForm() {
  fireEvent.click(screen.getByRole('button', { name: /Add New/ }));
  expect(await screen.findByText('New Meeting Minutes')).toBeInTheDocument();
}

function fillForm({ title, content } = {}) {
  if (title !== undefined) {
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: title } });
  }
  if (content !== undefined) {
    fireEvent.change(screen.getByTestId('quill-editor'), { target: { value: content } });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  getAllMeetingMinutes.mockResolvedValue(MINUTES);
});

describe('MeetingMinutesEditor', () => {
  test('shows a spinner then the list of minutes with dates and author', async () => {
    let resolveFetch;
    getAllMeetingMinutes.mockReturnValue(new Promise((res) => { resolveFetch = res; }));
    render(<MeetingMinutesEditor firebaseUid="uid-1" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await act(async () => resolveFetch(MINUTES));
    expect(screen.getByText('January Committee Meeting')).toBeInTheDocument();
    expect(screen.getByText('February Committee Meeting')).toBeInTheDocument();
    expect(screen.getByText(/January 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/- Created by Alice/)).toBeInTheDocument();
  });

  test('shows empty-state alert when there are no minutes', async () => {
    getAllMeetingMinutes.mockResolvedValue([]);
    await renderEditor();
    expect(await screen.findByText(/No meeting minutes yet/)).toBeInTheDocument();
  });

  test('shows an error when the fetch fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getAllMeetingMinutes.mockRejectedValue(new Error('down'));
    await renderEditor();
    expect(await screen.findByText('Failed to load meeting minutes.')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('header collapse toggles the content area', async () => {
    await renderEditor();
    await screen.findByText('January Committee Meeting');
    // header toggle shows ExpandLess while expanded (rows show ExpandMore)
    expect(screen.getByTestId('ExpandLessIcon')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ExpandLessIcon').closest('button'));
    expect(screen.queryByTestId('ExpandLessIcon')).not.toBeInTheDocument();
    // header icon is the first ExpandMore in DOM order; click re-expands
    fireEvent.click(screen.getAllByTestId('ExpandMoreIcon')[0].closest('button'));
    expect(screen.getByTestId('ExpandLessIcon')).toBeInTheDocument();
  });

  test('viewing toggles sanitized content (script tags stripped)', async () => {
    await renderEditor();
    const title = await screen.findByText('January Committee Meeting');
    fireEvent.click(title);
    const strong = await screen.findByText('budget');
    expect(strong.tagName).toBe('STRONG');
    const contentBox = strong.closest('div');
    expect(contentBox.innerHTML).not.toContain('script');
    expect(contentBox.innerHTML).not.toContain('alert');
    // toggle off again via the same title
    fireEvent.click(title);
    // the View icon button also toggles
    fireEvent.click(screen.getAllByTitle('View')[1]);
    expect(await screen.findByText('Race planning')).toBeInTheDocument();
  });

  describe('validation', () => {
    test('requires a title', async () => {
      await renderEditor();
      await openNewForm();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Please enter a title.')).toBeInTheDocument();
      expect(createMeetingMinutes).not.toHaveBeenCalled();
    });

    test('requires a meeting date', async () => {
      await renderEditor();
      await openNewForm();
      fillForm({ title: 'T' });
      fireEvent.change(screen.getByLabelText(/Meeting Date/), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Please select a meeting date.')).toBeInTheDocument();
    });

    test('requires content and rejects the empty-quill placeholder', async () => {
      await renderEditor();
      await openNewForm();
      fillForm({ title: 'T' });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Please enter meeting minutes content.')).toBeInTheDocument();

      fillForm({ content: '<p><br></p>' });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Please enter meeting minutes content.')).toBeInTheDocument();
      expect(createMeetingMinutes).not.toHaveBeenCalled();
    });
  });

  test('creates new minutes, refreshes the list and auto-clears the success message', async () => {
    jest.useFakeTimers();
    try {
      createMeetingMinutes.mockResolvedValue({ id: 3 });
      render(<MeetingMinutesEditor firebaseUid="uid-1" />);
      await act(async () => {});
      fireEvent.click(screen.getByRole('button', { name: /Add New/ }));
      fillForm({ title: 'March Meeting', content: '<p>Notes</p>' });

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await act(async () => {});

      expect(createMeetingMinutes).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'March Meeting', content: '<p>Notes</p>' }),
        'uid-1'
      );
      expect(getAllMeetingMinutes).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Meeting minutes created successfully!')).toBeInTheDocument();
      // form closed
      expect(screen.queryByText('New Meeting Minutes')).not.toBeInTheDocument();

      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(screen.queryByText('Meeting minutes created successfully!')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('Tab auto-fills an empty title with the default value', async () => {
    await renderEditor();
    await openNewForm();
    const title = screen.getByLabelText(/Title/);
    fireEvent.keyDown(title, { key: 'Tab' });
    expect(title).toHaveValue('Committee Meeting - [Month Year]');
    // Tab on non-empty field leaves it alone
    fireEvent.change(title, { target: { value: 'Custom' } });
    fireEvent.keyDown(title, { key: 'Tab' });
    expect(title).toHaveValue('Custom');
  });

  test('editing existing minutes pre-fills the form and updates via API', async () => {
    updateMeetingMinutes.mockResolvedValue({});
    await renderEditor();
    await screen.findByText('January Committee Meeting');

    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    expect(screen.getByText('Edit Meeting Minutes')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toHaveValue('January Committee Meeting');
    expect(screen.getByLabelText(/Meeting Date/)).toHaveValue('2026-01-15');

    // Edit and Delete buttons disabled while editing
    screen.getAllByTitle('Edit').forEach((btn) => expect(btn).toBeDisabled());
    screen.getAllByTitle('Delete').forEach((btn) => expect(btn).toBeDisabled());

    fillForm({ title: 'January Meeting (rev)' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMeetingMinutes).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: 'January Meeting (rev)', meeting_date: '2026-01-15' }),
        'uid-1'
      )
    );
    expect(await screen.findByText('Meeting minutes updated successfully!')).toBeInTheDocument();
  });

  test('save failure surfaces an error and keeps the form open', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createMeetingMinutes.mockRejectedValue(new Error('500'));
    await renderEditor();
    await openNewForm();
    fillForm({ title: 'T', content: '<p>C</p>' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Failed to save meeting minutes. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByText('New Meeting Minutes')).toBeInTheDocument();
    // dismiss the error alert
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to save meeting minutes/)).not.toBeInTheDocument()
    );
    consoleSpy.mockRestore();
  });

  test('cancel closes the form and clears state', async () => {
    await renderEditor();
    await openNewForm();
    fillForm({ title: 'Draft', content: '<p>x</p>' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New Meeting Minutes')).not.toBeInTheDocument();
    // reopen: fields reset
    await openNewForm();
    expect(screen.getByLabelText(/Title/)).toHaveValue('');
  });

  describe('deletion', () => {
    test('delete confirmation can be cancelled', async () => {
      await renderEditor();
      await screen.findByText('January Committee Meeting');
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      expect(await screen.findByText(/Delete Meeting Minutes\?/)).toBeInTheDocument();
      expect(screen.getAllByText(/January Committee Meeting/).length).toBeGreaterThan(1);

      fireEvent.click(screen.getByRole('button', { name: /Cancel 取消/ }));
      await waitFor(() =>
        expect(screen.queryByText(/Delete Meeting Minutes\?/)).not.toBeInTheDocument()
      );
      expect(deleteMeetingMinutes).not.toHaveBeenCalled();
    });

    test('confirming deletes via API and shows success', async () => {
      deleteMeetingMinutes.mockResolvedValue({});
      await renderEditor();
      await screen.findByText('January Committee Meeting');
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      fireEvent.click(await screen.findByRole('button', { name: /Delete 删除/ }));

      await waitFor(() => expect(deleteMeetingMinutes).toHaveBeenCalledWith(1, 'uid-1'));
      expect(await screen.findByText('Meeting minutes deleted successfully!')).toBeInTheDocument();
      expect(getAllMeetingMinutes).toHaveBeenCalledTimes(2);
    });

    test('delete failure shows an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      deleteMeetingMinutes.mockRejectedValue(new Error('403'));
      await renderEditor();
      await screen.findByText('January Committee Meeting');
      fireEvent.click(screen.getAllByTitle('Delete')[0]);
      fireEvent.click(await screen.findByRole('button', { name: /Delete 删除/ }));
      expect(await screen.findByText('Failed to delete meeting minutes.')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });
});
