/**
 * Gallery API client
 * Handles all gallery-related API calls (event photo galleries)
 */

import { api, clearApiCache } from './client';
import { getAnonymousId } from './engagement';

// GALLERY IMAGE ENDPOINTS

/**
 * Get all gallery images for an event
 * @param {number} eventId - Event ID
 * @param {string|null} firebaseUid - Optional Firebase UID for logged-in check
 * @returns {Promise<Array>} - List of gallery images
 */
export const getEventGallery = async (eventId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.get(`/api/events/${eventId}/gallery`, params, headers);
};

/**
 * Get gallery preview for an event (first N images with count)
 * @param {number} eventId - Event ID
 * @param {number} limit - Number of images to fetch (default 5)
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Preview data with images, total_count, has_more
 */
export const getEventGalleryPreview = async (eventId, limit = 5, firebaseUid = null) => {
  const params = firebaseUid
    ? { limit }
    : { limit, anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.get(`/api/events/${eventId}/gallery/preview`, params, headers);
};

/**
 * Get gallery previews for multiple events in a single request
 * @param {Array<number>} eventIds - Event IDs
 * @param {string|null} firebaseUid - Optional Firebase UID
 * @returns {Promise<Object>} - Map of event_id to preview data
 */
export const getBatchGalleryPreview = async (eventIds, firebaseUid = null) => {
  const body = firebaseUid
    ? { event_ids: eventIds }
    : { event_ids: eventIds, anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.post('/api/events/gallery/batch-preview', body, headers);
};

/**
 * Upload a new image to event gallery (uploads file to S3)
 * @param {number} eventId - Event ID
 * @param {File} file - Image file to upload
 * @param {string|null} caption - Optional caption (English)
 * @param {string|null} captionCn - Optional caption (Chinese)
 * @param {string|null} firebaseUid - User's Firebase UID (optional but recommended)
 * @returns {Promise<Object>} - Created gallery image
 */
export const uploadGalleryImage = async (eventId, file, caption = null, captionCn = null, firebaseUid = null, uploaderName = null) => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

  const formData = new FormData();
  formData.append('file', file);
  if (caption) formData.append('caption', caption);
  if (captionCn) formData.append('caption_cn', captionCn);
  if (uploaderName) formData.append('uploaded_by_name', uploaderName);

  const headers = {};
  if (firebaseUid) {
    headers['X-Firebase-UID'] = firebaseUid;
  }

  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/gallery`, {
    method: 'POST',
    headers,  // Don't set Content-Type - browser sets it with boundary for FormData
    body: formData,
  });

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON
    }
    throw new Error(errorData?.detail || `Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  clearApiCache('/api/events', '/api/gallery');
  return result;
};

/**
 * Update a gallery image (admin only)
 * @param {number} imageId - Gallery image ID
 * @param {Object} updateData - Fields to update
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Updated gallery image
 */
export const updateGalleryImage = async (imageId, updateData, firebaseUid) => {
  return api.put(`/api/gallery/${imageId}`, updateData, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Delete a gallery image (uploader or admin only)
 * @param {number} imageId - Gallery image ID
 * @param {string} firebaseUid - User's Firebase UID
 * @returns {Promise<Object>} - Deletion confirmation
 */
export const deleteGalleryImage = async (imageId, firebaseUid) => {
  return api.delete(`/api/gallery/${imageId}`, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Toggle like on a gallery image
 * @param {number} imageId - Gallery image ID
 * @param {string|null} firebaseUid - Optional Firebase UID for logged-in users
 * @returns {Promise<Object>} - Updated like count and user_liked status
 */
export const toggleGalleryImageLike = async (imageId, firebaseUid = null) => {
  const params = firebaseUid ? {} : { anonymous_id: getAnonymousId() };
  const headers = firebaseUid ? { 'X-Firebase-UID': firebaseUid } : {};
  return api.post(`/api/gallery/${imageId}/likes?${new URLSearchParams(params)}`, {}, headers);
};

// GALLERY DELETION REQUEST ENDPOINTS

/**
 * Submit a deletion request for a gallery image
 * @param {number} imageId - Gallery image ID
 * @param {string} reason - Reason for requesting deletion
 * @param {string} firebaseUid - User's Firebase UID
 * @returns {Promise<Object>} - Created deletion request
 */
export const requestGalleryImageDeletion = async (imageId, reason, firebaseUid) => {
  return api.post(`/api/gallery/${imageId}/deletion-request`, { reason }, {
    'X-Firebase-UID': firebaseUid,
  });
};

/**
 * Resolve (approve/reject) a gallery deletion request (admin only)
 * @param {number} requestId - Deletion request ID
 * @param {boolean} approved - Whether to approve the deletion
 * @param {string} firebaseUid - Admin's Firebase UID
 * @returns {Promise<Object>} - Updated deletion request
 */
export const resolveGalleryDeletionRequest = async (requestId, approved, firebaseUid) => {
  return api.put(`/api/gallery/deletion-request/${requestId}`, { approved }, {
    'X-Firebase-UID': firebaseUid,
  });
};

// UTILITY FUNCTIONS

/**
 * Compress an image file and return a data URL (for previews)
 * @param {File} file - Original image file
 * @param {number} maxWidth - Maximum width (default 1200px)
 * @param {number} quality - JPEG quality 0-1 (default 0.8)
 * @returns {Promise<string>} - Compressed base64 data URL
 */
export const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

/**
 * Compress an image file and return a File object (for uploading)
 * Resizes to max 2048px on longest side and compresses to JPEG.
 * @param {File} file - Original image file
 * @param {number} maxDimension - Maximum width or height (default 2048px)
 * @param {number} quality - JPEG quality 0-1 (default 0.85)
 * @returns {Promise<File>} - Compressed File object
 */
export const compressImageForUpload = (file, maxDimension = 2048, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    // Skip compression for small files (<2MB) and non-raster types
    if (file.size < 2 * 1024 * 1024 && !file.type.includes('heic')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if either dimension exceeds max
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // Fallback to original
              return;
            }
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg' }
            );
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file); // Fallback to original on error
    };
    reader.onerror = () => resolve(file); // Fallback to original on error
  });
};

/**
 * Download an image from a URL or data URL
 * @param {string} imageUrl - Image URL or data URL
 * @param {string} filename - Filename for download
 */
export const downloadImage = async (imageUrl, filename = 'gallery-image.jpg') => {
  try {
    let blob;

    if (imageUrl.startsWith('data:')) {
      // Convert base64 data URL to Blob for reliable download
      const response = await fetch(imageUrl);
      blob = await response.blob();
    } else {
      // For regular URLs, fetch the image
      const response = await fetch(imageUrl, { mode: 'cors' });
      blob = await response.blob();
    }

    // Create object URL and download
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up object URL
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Download failed:', error);
    // Fallback to simple anchor method
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Share an image URL using Web Share API or fallback to clipboard
 * @param {string} imageUrl - Image URL to share
 * @param {string} title - Share title
 * @returns {Promise<boolean>} - Whether share was successful
 */
export const shareImage = async (imageUrl, title = 'Check out this photo!') => {
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        url: imageUrl,
      });
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
      return false;
    }
  } else {
    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(imageUrl);
      return true;
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      return false;
    }
  }
};
