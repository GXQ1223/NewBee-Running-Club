import { api, clearApiCache } from './client';
import {
  getEventGallery,
  getEventGalleryPreview,
  getBatchGalleryPreview,
  uploadGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  toggleGalleryImageLike,
  requestGalleryImageDeletion,
  resolveGalleryDeletionRequest,
  compressImage,
  compressImageForUpload,
  downloadImage,
  shareImage,
} from './gallery';

jest.mock('./client', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  clearApiCache: jest.fn(),
}));
jest.mock('./engagement', () => ({
  getAnonymousId: jest.fn(),
}));
const { getAnonymousId } = require('./engagement');

const BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
const UID = 'user-uid';
const AUTH = { 'X-Firebase-UID': UID };

beforeEach(() => {
  jest.clearAllMocks();
  getAnonymousId.mockReturnValue('anon_test');
  api.get.mockResolvedValue('GET');
  api.post.mockResolvedValue('POST');
  api.put.mockResolvedValue('PUT');
  api.delete.mockResolvedValue('DELETE');
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('gallery endpoints', () => {
  test('getEventGallery handles logged-in and anonymous users', async () => {
    await getEventGallery(5, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/5/gallery', {}, AUTH);

    await getEventGallery(5);
    expect(api.get).toHaveBeenCalledWith('/api/events/5/gallery', { anonymous_id: 'anon_test' }, {});
  });

  test('getEventGalleryPreview defaults limit to 5 and adds anonymous_id when logged out', async () => {
    await getEventGalleryPreview(5);
    expect(api.get).toHaveBeenCalledWith(
      '/api/events/5/gallery/preview',
      { limit: 5, anonymous_id: 'anon_test' },
      {}
    );
  });

  test('getEventGalleryPreview passes custom limit with UID header', async () => {
    await getEventGalleryPreview(5, 8, UID);
    expect(api.get).toHaveBeenCalledWith('/api/events/5/gallery/preview', { limit: 8 }, AUTH);
  });

  test('getBatchGalleryPreview POSTs event ids for both auth states', async () => {
    await getBatchGalleryPreview([1, 2], UID);
    expect(api.post).toHaveBeenCalledWith(
      '/api/events/gallery/batch-preview',
      { event_ids: [1, 2] },
      AUTH
    );

    await getBatchGalleryPreview([1, 2]);
    expect(api.post).toHaveBeenCalledWith(
      '/api/events/gallery/batch-preview',
      { event_ids: [1, 2], anonymous_id: 'anon_test' },
      {}
    );
  });

  test('updateGalleryImage PUTs update data with admin header', async () => {
    await updateGalleryImage(9, { caption: 'Finish line' }, UID);
    expect(api.put).toHaveBeenCalledWith('/api/gallery/9', { caption: 'Finish line' }, AUTH);
  });

  test('deleteGalleryImage DELETEs with user header', async () => {
    await deleteGalleryImage(9, UID);
    expect(api.delete).toHaveBeenCalledWith('/api/gallery/9', AUTH);
  });

  test('toggleGalleryImageLike POSTs anonymous_id in query when logged out', async () => {
    await toggleGalleryImageLike(9);
    expect(api.post).toHaveBeenCalledWith('/api/gallery/9/likes?anonymous_id=anon_test', {}, {});
  });

  test('toggleGalleryImageLike uses UID header when logged in', async () => {
    await toggleGalleryImageLike(9, UID);
    expect(api.post).toHaveBeenCalledWith('/api/gallery/9/likes?', {}, AUTH);
  });

  test('requestGalleryImageDeletion POSTs the reason', async () => {
    await requestGalleryImageDeletion(9, 'blurry', UID);
    expect(api.post).toHaveBeenCalledWith('/api/gallery/9/deletion-request', { reason: 'blurry' }, AUTH);
  });

  test('resolveGalleryDeletionRequest PUTs the approval decision', async () => {
    await resolveGalleryDeletionRequest(4, true, UID);
    expect(api.put).toHaveBeenCalledWith('/api/gallery/deletion-request/4', { approved: true }, AUTH);
  });
});

describe('uploadGalleryImage', () => {
  const file = new File(['img'], 'run.png', { type: 'image/png' });

  test('POSTs multipart form data with captions and clears related caches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await uploadGalleryImage(5, file, 'Race day', '比赛日', UID, 'Jane');

    expect(result).toEqual({ id: 1 });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/events/5/gallery`);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(AUTH);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file')).toBe(file);
    expect(options.body.get('caption')).toBe('Race day');
    expect(options.body.get('caption_cn')).toBe('比赛日');
    expect(options.body.get('uploaded_by_name')).toBe('Jane');
    expect(clearApiCache).toHaveBeenCalledWith('/api/events', '/api/gallery');
  });

  test('omits optional fields and auth header when not provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 2 }),
    });

    await uploadGalleryImage(5, file);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers).toEqual({});
    expect(options.body.get('caption')).toBeNull();
    expect(options.body.get('caption_cn')).toBeNull();
    expect(options.body.get('uploaded_by_name')).toBeNull();
  });

  test('throws the server detail message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: () => Promise.resolve({ detail: 'file too large' }),
    });

    await expect(uploadGalleryImage(5, file)).rejects.toThrow('file too large');
    expect(clearApiCache).not.toHaveBeenCalled();
  });

  test('falls back to a status message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(uploadGalleryImage(5, file)).rejects.toThrow('Upload failed with status 500');
  });
});

describe('image compression', () => {
  let imageConfig;
  let readerShouldError;
  let canvasBlobValue;
  let lastCanvas;
  const OriginalFileReader = global.FileReader;
  const OriginalImage = global.Image;

  beforeEach(() => {
    imageConfig = { width: 100, height: 100, fail: false };
    readerShouldError = false;
    canvasBlobValue = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    lastCanvas = null;

    global.FileReader = class {
      readAsDataURL(file) {
        Promise.resolve().then(() => {
          if (readerShouldError) {
            this.onerror(new Error('read failed'));
          } else {
            this.onload({ target: { result: `data:image/png;base64,${file.name}` } });
          }
        });
      }
    };

    global.Image = class {
      set src(value) {
        this._src = value;
        Promise.resolve().then(() => {
          if (imageConfig.fail) {
            this.onerror(new Error('bad image'));
          } else {
            this.width = imageConfig.width;
            this.height = imageConfig.height;
            this.onload();
          }
        });
      }
      get src() {
        return this._src;
      }
    };

    const realCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
      if (tag === 'canvas') {
        lastCanvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: jest.fn() }),
          toDataURL: jest.fn(() => 'data:image/jpeg;base64,compressed'),
          toBlob: (cb) => cb(canvasBlobValue),
        };
        return lastCanvas;
      }
      return realCreateElement(tag, ...rest);
    });
  });

  afterEach(() => {
    global.FileReader = OriginalFileReader;
    global.Image = OriginalImage;
  });

  const smallFile = new File(['x'], 'small.png', { type: 'image/png' });
  const bigFile = () => new File([new Uint8Array(2 * 1024 * 1024)], 'big.png', { type: 'image/png' });

  describe('compressImage', () => {
    test('scales wide images down to maxWidth preserving aspect ratio', async () => {
      imageConfig = { width: 2400, height: 1200 };
      const dataUrl = await compressImage(smallFile, 1200, 0.7);
      expect(dataUrl).toBe('data:image/jpeg;base64,compressed');
      expect(lastCanvas.width).toBe(1200);
      expect(lastCanvas.height).toBe(600);
      expect(lastCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
    });

    test('keeps dimensions when image is narrower than the default maxWidth', async () => {
      imageConfig = { width: 800, height: 500 };
      await compressImage(smallFile);
      expect(lastCanvas.width).toBe(800);
      expect(lastCanvas.height).toBe(500);
      expect(lastCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
    });

    test('rejects when the image fails to load', async () => {
      imageConfig.fail = true;
      await expect(compressImage(smallFile)).rejects.toBeTruthy();
    });

    test('rejects when the file cannot be read', async () => {
      readerShouldError = true;
      await expect(compressImage(smallFile)).rejects.toBeTruthy();
    });
  });

  describe('compressImageForUpload', () => {
    test('skips compression for small non-heic files', async () => {
      await expect(compressImageForUpload(smallFile)).resolves.toBe(smallFile);
      expect(lastCanvas).toBeNull();
    });

    test('compresses large landscape images to the max dimension', async () => {
      imageConfig = { width: 4096, height: 2048 };
      const result = await compressImageForUpload(bigFile());
      expect(lastCanvas.width).toBe(2048);
      expect(lastCanvas.height).toBe(1024);
      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('big.jpg');
      expect(result.type).toBe('image/jpeg');
    });

    test('compresses large portrait images against the height', async () => {
      imageConfig = { width: 1000, height: 4000 };
      await compressImageForUpload(bigFile(), 2048, 0.85);
      expect(lastCanvas.width).toBe(512);
      expect(lastCanvas.height).toBe(2048);
    });

    test('does not upscale large files with small dimensions', async () => {
      imageConfig = { width: 300, height: 200 };
      await compressImageForUpload(bigFile());
      expect(lastCanvas.width).toBe(300);
      expect(lastCanvas.height).toBe(200);
    });

    test('compresses small heic files despite the size threshold', async () => {
      const heic = new File(['x'], 'photo.heic', { type: 'image/heic' });
      imageConfig = { width: 100, height: 100 };
      const result = await compressImageForUpload(heic);
      expect(result.name).toBe('photo.jpg');
      expect(result.type).toBe('image/jpeg');
    });

    test('falls back to the original file when toBlob yields null', async () => {
      canvasBlobValue = null;
      const original = bigFile();
      await expect(compressImageForUpload(original)).resolves.toBe(original);
    });

    test('falls back to the original file when the image fails to load', async () => {
      imageConfig.fail = true;
      const original = bigFile();
      await expect(compressImageForUpload(original)).resolves.toBe(original);
    });

    test('falls back to the original file when the reader errors', async () => {
      readerShouldError = true;
      const original = bigFile();
      await expect(compressImageForUpload(original)).resolves.toBe(original);
    });
  });
});

describe('downloadImage', () => {
  let clickSpy;
  let createUrlSpy;
  let revokeUrlSpy;

  beforeEach(() => {
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createUrlSpy = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    revokeUrlSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  test('fetches a remote URL with CORS, downloads via object URL, and revokes it', async () => {
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'])) });

    await downloadImage('https://cdn.example.com/pic.jpg', 'pic.jpg');

    expect(global.fetch).toHaveBeenCalledWith('https://cdn.example.com/pic.jpg', { mode: 'cors' });
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:fake');
  });

  test('converts data URLs to blobs before downloading', async () => {
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['img'])) });

    await downloadImage('data:image/jpeg;base64,abc');

    expect(global.fetch).toHaveBeenCalledWith('data:image/jpeg;base64,abc');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('falls back to a plain anchor download when fetch fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('CORS blocked'));

    await downloadImage('https://cdn.example.com/pic.jpg', 'pic.jpg');

    expect(errorSpy).toHaveBeenCalledWith('Download failed:', expect.any(Error));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createUrlSpy).not.toHaveBeenCalled();
  });
});

describe('shareImage', () => {
  afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
  });

  function defineNavigator(prop, value) {
    Object.defineProperty(navigator, prop, { value, configurable: true, writable: true });
  }

  test('uses the Web Share API when available', async () => {
    defineNavigator('share', jest.fn().mockResolvedValue(undefined));

    await expect(shareImage('https://x/pic.jpg', 'Look!')).resolves.toBe(true);
    expect(navigator.share).toHaveBeenCalledWith({ title: 'Look!', url: 'https://x/pic.jpg' });
  });

  test('returns false quietly when the user aborts sharing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    defineNavigator('share', jest.fn().mockRejectedValue(abort));

    await expect(shareImage('https://x/pic.jpg')).resolves.toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('logs and returns false when sharing fails for other reasons', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    defineNavigator('share', jest.fn().mockRejectedValue(new Error('boom')));

    await expect(shareImage('https://x/pic.jpg')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Share failed:', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('falls back to the clipboard with the default title when share is unavailable', async () => {
    defineNavigator('clipboard', { writeText: jest.fn().mockResolvedValue(undefined) });

    await expect(shareImage('https://x/pic.jpg')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://x/pic.jpg');
  });

  test('returns false when the clipboard write fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    defineNavigator('clipboard', { writeText: jest.fn().mockRejectedValue(new Error('denied')) });

    await expect(shareImage('https://x/pic.jpg')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Clipboard copy failed:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
