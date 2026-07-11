import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AddRaceRecordDialog from './AddRaceRecordDialog';
import { createRaceSubmission, updateRaceSubmission } from '../api/raceSubmissions';
import { uploadBytes, getDownloadURL } from 'firebase/storage';

jest.mock('../api/raceSubmissions', () => ({
  createRaceSubmission: jest.fn(),
  updateRaceSubmission: jest.fn(),
}));

const onClose = jest.fn();
const onSubmitted = jest.fn();

const renderDialog = (props = {}) =>
  render(
    <AddRaceRecordDialog
      open
      onClose={onClose}
      onSubmitted={onSubmitted}
      firebaseUid="uid-1"
      editSubmission={null}
      {...props}
    />
  );

const fillRequired = () => {
  fireEvent.change(screen.getByLabelText(/Race Name/), { target: { value: 'Boston Marathon' } });
  fireEvent.change(screen.getByLabelText(/Race Date/), { target: { value: '2026-04-20' } });
  fireEvent.change(screen.getByLabelText(/Finish Time/), { target: { value: '3:25:58' } });
};

beforeEach(() => {
  jest.clearAllMocks();
  createRaceSubmission.mockResolvedValue({});
  updateRaceSubmission.mockResolvedValue({});
  uploadBytes.mockResolvedValue({});
  getDownloadURL.mockResolvedValue('https://cdn/race.jpg');
});

test('requires the mandatory fields before submitting', async () => {
  renderDialog();
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  expect(await screen.findByText(/are required/)).toBeInTheDocument();
  expect(createRaceSubmission).not.toHaveBeenCalled();
});

test('validates the finish time format', async () => {
  renderDialog();
  fillRequired();
  fireEvent.change(screen.getByLabelText(/Finish Time/), { target: { value: 'fast' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  expect(await screen.findByText(/Finish time must be/)).toBeInTheDocument();
  expect(createRaceSubmission).not.toHaveBeenCalled();
});

test('rejects a future race date', async () => {
  renderDialog();
  fillRequired();
  fireEvent.change(screen.getByLabelText(/Race Date/), { target: { value: '2099-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  expect(await screen.findByText(/cannot be in the future/)).toBeInTheDocument();
  expect(createRaceSubmission).not.toHaveBeenCalled();
});

test('submits a new record and closes', async () => {
  renderDialog();
  fillRequired();
  fireEvent.change(screen.getByLabelText(/Official Results Link/), { target: { value: 'https://baa.org/results' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));

  await waitFor(() =>
    expect(createRaceSubmission).toHaveBeenCalledWith(
      {
        race_name: 'Boston Marathon',
        race_date: '2026-04-20',
        race_distance: 'Marathon',
        finish_time: '3:25:58',
        proof_url: 'https://baa.org/results',
        photo_url: null,
      },
      'uid-1'
    )
  );
  await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  expect(onClose).toHaveBeenCalled();
});

test('custom distance replaces the preset when Other is chosen', async () => {
  renderDialog();
  fillRequired();

  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Other/ }));
  fireEvent.change(screen.getByLabelText(/Custom Distance/), { target: { value: '50K' } });

  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  await waitFor(() =>
    expect(createRaceSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ race_distance: '50K' }),
      'uid-1'
    )
  );
});

test('shows the API error when submission fails', async () => {
  createRaceSubmission.mockRejectedValueOnce(new Error('Race date cannot be in the future.'));
  renderDialog();
  fillRequired();
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  expect(await screen.findByText('Race date cannot be in the future.')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

test('uploads a race photo and includes its URL in the payload', async () => {
  renderDialog();
  fillRequired();

  const input = screen.getByTestId('race-photo-input');
  fireEvent.change(input, { target: { files: [new File(['img'], 'race.jpg', { type: 'image/jpeg' })] } });

  expect(await screen.findByAltText('Race')).toHaveAttribute('src', 'https://cdn/race.jpg');
  expect(screen.getByRole('button', { name: /Change Race Photo/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));
  await waitFor(() =>
    expect(createRaceSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ photo_url: 'https://cdn/race.jpg' }),
      'uid-1'
    )
  );
});

test('photo upload validates type and size and surfaces failures', async () => {
  renderDialog();
  const input = screen.getByTestId('race-photo-input');

  fireEvent.change(input, { target: { files: [new File(['t'], 'a.txt', { type: 'text/plain' })] } });
  expect(await screen.findByText(/Please select an image file/)).toBeInTheDocument();

  const big = new File(['x'], 'big.png', { type: 'image/png' });
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
  fireEvent.change(input, { target: { files: [big] } });
  expect(await screen.findByText(/Image size must be less than 5MB/)).toBeInTheDocument();
  expect(uploadBytes).not.toHaveBeenCalled();

  uploadBytes.mockRejectedValueOnce(new Error('storage down'));
  fireEvent.change(input, { target: { files: [new File(['x'], 'ok.png', { type: 'image/png' })] } });
  expect(await screen.findByText(/Failed to upload photo/)).toBeInTheDocument();
});

test('edit mode pre-fills fields (including custom distance) and updates', async () => {
  renderDialog({
    editSubmission: {
      id: 13, race_name: 'Backyard Ultra', race_date: '2025-10-01', race_distance: '50K',
      finish_time: '5:00:00', proof_url: 'https://ultra/results', photo_url: 'https://img/u.jpg',
    },
  });

  expect(screen.getByText('Edit Race Record / 编辑比赛成绩')).toBeInTheDocument();
  expect(screen.getByLabelText(/Race Name/)).toHaveValue('Backyard Ultra');
  expect(screen.getByLabelText(/Custom Distance/)).toHaveValue('50K');
  expect(screen.getByAltText('Race')).toHaveAttribute('src', 'https://img/u.jpg');

  fireEvent.change(screen.getByLabelText(/Finish Time/), { target: { value: '4:59:00' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit for Review/ }));

  await waitFor(() =>
    expect(updateRaceSubmission).toHaveBeenCalledWith(
      13,
      expect.objectContaining({ finish_time: '4:59:00', photo_url: 'https://img/u.jpg' }),
      'uid-1'
    )
  );
});

test('edit mode pre-fills preset distances without the custom field', () => {
  renderDialog({
    editSubmission: {
      id: 11, race_name: 'Jersey City Half', race_date: '2026-06-28', race_distance: 'Half Marathon',
      finish_time: '1:36:40', proof_url: null, photo_url: null,
    },
  });
  expect(screen.queryByLabelText(/Custom Distance/)).not.toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveTextContent('Half Marathon');
});

test('cancel closes without submitting', () => {
  renderDialog();
  fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
  expect(onClose).toHaveBeenCalled();
  expect(createRaceSubmission).not.toHaveBeenCalled();
});
