import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GalleryUploadButton from './GalleryUploadButton';
import {
  uploadGalleryImage,
  compressImage,
  compressImageForUpload,
} from '../api/gallery';
import { useAuth } from '../context/AuthContext';

jest.mock('../api/gallery', () => ({
  uploadGalleryImage: jest.fn(),
  compressImage: jest.fn(),
  compressImageForUpload: jest.fn(),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const makeFile = (name, type = 'image/png', size) => {
  const file = new File(['x'], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
};

const getFileInput = () => document.querySelector('input[type="file"]');

async function openDialogAndSelect(files) {
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByText('Upload Photos')).toBeInTheDocument();
  if (files) {
    fireEvent.change(getFileInput(), { target: { files } });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'user-1' } });
  compressImage.mockResolvedValue('data:image/jpeg;base64,preview');
  compressImageForUpload.mockImplementation(async (f) => f);
});

describe('GalleryUploadButton', () => {
  test('renders a FAB by default and a button variant on demand', () => {
    const { unmount } = render(<GalleryUploadButton eventId={1} />);
    expect(screen.getByTestId('AddPhotoAlternateIcon')).toBeInTheDocument();
    expect(screen.queryByText('Upload Photos / 上传照片')).not.toBeInTheDocument();
    unmount();
    render(<GalleryUploadButton eventId={1} variant="button" />);
    expect(screen.getByText('Upload Photos / 上传照片')).toBeInTheDocument();
  });

  test('does not open dialog for anonymous users', () => {
    useAuth.mockReturnValue({ currentUser: null });
    render(<GalleryUploadButton eventId={1} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Upload Photos')).not.toBeInTheDocument();
  });

  test('opens dialog with empty-state drop zone that triggers the file input', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect();
    const input = getFileInput();
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Click to select images'));
    expect(clickSpy).toHaveBeenCalled();
  });

  test('selecting images shows compressed previews and count', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('a.png'), makeFile('b.png')]);
    expect(await screen.findByAltText('Preview 1')).toBeInTheDocument();
    expect(screen.getByAltText('Preview 2')).toBeInTheDocument();
    expect(screen.getByText(/2 photos selected/)).toBeInTheDocument();
    expect(compressImage).toHaveBeenCalledTimes(2);
    // input is reset so the same files can be picked again
    expect(getFileInput().value).toBe('');
  });

  test('empty file selection is a no-op', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([]);
    expect(compressImage).not.toHaveBeenCalled();
    expect(screen.getByText('Click to select images')).toBeInTheDocument();
  });

  test('skips non-image files with an error message', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('notes.txt', 'text/plain'), makeFile('a.png')]);
    expect(
      await screen.findByText('Some files are not images and were skipped / 部分文件不是图片，已跳过')
    ).toBeInTheDocument();
    expect(await screen.findByText(/1 photo selected/)).toBeInTheDocument();
  });

  test('skips oversized files with an error message', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('huge.png', 'image/png', 51 * 1024 * 1024)]);
    expect(
      await screen.findByText('Some images exceed 50MB and were skipped / 部分图片超过50MB，已跳过')
    ).toBeInTheDocument();
  });

  test('falls back to FileReader preview when compression fails', async () => {
    compressImage.mockRejectedValue(new Error('no canvas'));
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('a.png')]);
    expect(await screen.findByAltText('Preview 1')).toBeInTheDocument();
    expect(screen.getByText(/1 photo selected/)).toBeInTheDocument();
  });

  test('remove button deletes a selected preview', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('a.png'), makeFile('b.png')]);
    await screen.findByText(/2 photos selected/);
    const removeButtons = screen
      .getAllByTestId('CloseIcon')
      .map((icon) => icon.closest('button'))
      .filter((btn) => btn && btn.querySelector('svg[data-testid="CloseIcon"]'));
    // last CloseIcons belong to preview tiles; the first is the dialog close
    fireEvent.click(removeButtons[1]);
    expect(await screen.findByText(/1 photo selected/)).toBeInTheDocument();
  });

  test('"Add more" tile triggers the file input', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('a.png')]);
    await screen.findByText(/1 photo selected/);
    const input = getFileInput();
    const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Add more'));
    expect(clickSpy).toHaveBeenCalled();
  });

  test('uploads all files, notifies parent per file, and closes on success', async () => {
    uploadGalleryImage
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ id: 11 });
    const onUploadSuccess = jest.fn();
    render(<GalleryUploadButton eventId={7} onUploadSuccess={onUploadSuccess} />);
    await openDialogAndSelect([makeFile('a.png'), makeFile('b.png')]);
    await screen.findByText(/2 photos selected/);

    fireEvent.click(screen.getByRole('button', { name: /Upload 2 Photos/ }));

    await waitFor(() => expect(uploadGalleryImage).toHaveBeenCalledTimes(2));
    expect(uploadGalleryImage).toHaveBeenCalledWith(7, expect.any(File), null, null, 'user-1');
    expect(compressImageForUpload).toHaveBeenCalledTimes(2);
    expect(onUploadSuccess).toHaveBeenCalledWith({ id: 10 });
    expect(onUploadSuccess).toHaveBeenCalledWith({ id: 11 });
    await waitFor(() => expect(screen.queryByText('Upload Photos')).not.toBeInTheDocument());
  });

  test('shows progress and disables controls while uploading', async () => {
    let resolveUpload;
    uploadGalleryImage.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    render(<GalleryUploadButton eventId={7} />);
    await openDialogAndSelect([makeFile('a.png')]);
    await screen.findByText(/1 photo selected/);

    fireEvent.click(screen.getByRole('button', { name: /Upload 1 Photo/ }));

    expect(await screen.findByText('Uploading 1 of 1...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Uploading 1\/1/ })).toBeDisabled();

    resolveUpload({ id: 10 });
    await waitFor(() => expect(screen.queryByText('Upload Photos')).not.toBeInTheDocument());
  });

  test('keeps failed files and shows error when some uploads fail', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    uploadGalleryImage.mockImplementation(async (eventId, file) => {
      if (file.name === 'b.png') throw new Error('server error');
      return { id: 10 };
    });
    const onUploadSuccess = jest.fn();
    render(<GalleryUploadButton eventId={7} onUploadSuccess={onUploadSuccess} />);
    await openDialogAndSelect([makeFile('a.png'), makeFile('b.png')]);
    await screen.findByText(/2 photos selected/);

    fireEvent.click(screen.getByRole('button', { name: /Upload 2 Photos/ }));

    expect(await screen.findByText('Failed to upload: b.png')).toBeInTheDocument();
    expect(onUploadSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/1 photo selected/)).toBeInTheDocument();
    // dialog stays open for retry
    expect(screen.getByText('Upload Photos')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  test('upload is a no-op without an eventId', async () => {
    render(<GalleryUploadButton />);
    await openDialogAndSelect([makeFile('a.png')]);
    await screen.findByText(/1 photo selected/);
    fireEvent.click(screen.getByRole('button', { name: /Upload 1 Photo/ }));
    expect(uploadGalleryImage).not.toHaveBeenCalled();
  });

  test('upload button disabled with no files selected', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect();
    expect(screen.getByRole('button', { name: /Upload\s+Photo/ })).toBeDisabled();
  });

  test('cancel resets state and closes the dialog', async () => {
    render(<GalleryUploadButton eventId={1} />);
    await openDialogAndSelect([makeFile('a.png')]);
    await screen.findByText(/1 photo selected/);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByText('Upload Photos')).not.toBeInTheDocument());

    // reopen: selection was cleared
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(await screen.findByText('Click to select images')).toBeInTheDocument();
  });
});
