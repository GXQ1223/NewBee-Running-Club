import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  IconButton,
  Typography,
  Slide,
  useTheme,
  useMediaQuery,
  Snackbar,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { toggleGalleryImageLike, downloadImage, shareImage } from '../api/gallery';
import { useAuth } from '../context/AuthContext';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

/**
 * GalleryLightbox - Full-screen image viewer with navigation, like, download, share
 */
const GalleryLightbox = ({
  open,
  onClose,
  images,
  initialIndex = 0,
  onImageUpdate,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [liking, setLiking] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentUser } = useAuth();

  // Reset index when opening with new initialIndex
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  const currentImage = images[currentIndex];

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return;
      switch (e.key) {
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case 'Escape':
          onClose();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrevious, handleNext, onClose]);

  const handleLike = async () => {
    if (liking || !currentImage) return;
    setLiking(true);

    try {
      const result = await toggleGalleryImageLike(currentImage.id, currentUser?.uid);
      // Update the image in the parent's state
      if (onImageUpdate) {
        onImageUpdate(currentImage.id, {
          like_count: result.like_count,
          user_liked: result.user_liked,
        });
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: 'Failed to update like',
        severity: 'error',
      });
    } finally {
      setLiking(false);
    }
  };

  const handleDownload = () => {
    if (!currentImage) return;
    const filename = `gallery-${currentImage.id}.jpg`;
    downloadImage(currentImage.image_url, filename);
    setSnackbar({
      open: true,
      message: 'Download started / 开始下载',
      severity: 'success',
    });
  };

  const handleShare = async () => {
    if (!currentImage) return;

    // For base64 images, we can't directly share the URL
    // We'll share the current page URL instead
    const shareUrl = `${window.location.origin}/events/${currentImage.event_id}/gallery?image=${currentImage.id}`;
    const success = await shareImage(shareUrl, 'Check out this photo from NewBee Running Club!');

    setSnackbar({
      open: true,
      message: success
        ? 'Copied to clipboard / 已复制到剪贴板'
        : 'Failed to share',
      severity: success ? 'success' : 'error',
    });
  };

  if (!currentImage) return null;

  return (
    <>
      <Dialog
        fullScreen
        open={open}
        onClose={onClose}
        TransitionComponent={Transition}
        PaperProps={{
          sx: {
            bgcolor: 'rgba(0, 0, 0, 0.95)',
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
            }}
          >
            <Typography variant="body2" sx={{ color: 'white' }}>
              {currentIndex + 1} / {images.length}
            </Typography>
            <IconButton onClick={onClose} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Main image container */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Previous button */}
            {images.length > 1 && (
              <IconButton
                onClick={handlePrevious}
                sx={{
                  position: 'absolute',
                  left: isMobile ? 8 : 24,
                  color: 'white',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  zIndex: 1,
                }}
              >
                <NavigateBeforeIcon fontSize="large" />
              </IconButton>
            )}

            {/* Image */}
            <Box
              component="img"
              src={currentImage.image_url}
              alt={currentImage.caption || 'Gallery image'}
              sx={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
              }}
            />

            {/* Next button */}
            {images.length > 1 && (
              <IconButton
                onClick={handleNext}
                sx={{
                  position: 'absolute',
                  right: isMobile ? 8 : 24,
                  color: 'white',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  zIndex: 1,
                }}
              >
                <NavigateNextIcon fontSize="large" />
              </IconButton>
            )}
          </Box>

          {/* Footer with actions and caption */}
          <Box
            sx={{
              p: 2,
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
            }}
          >
            {/* Caption */}
            {(currentImage.caption || currentImage.caption_cn) && (
              <Box sx={{ mb: 2, textAlign: 'center' }}>
                {currentImage.caption && (
                  <Typography variant="body1" sx={{ color: 'white' }}>
                    {currentImage.caption}
                  </Typography>
                )}
                {currentImage.caption_cn && (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    {currentImage.caption_cn}
                  </Typography>
                )}
              </Box>
            )}

            {/* Action buttons */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              {/* Like button */}
              <Box sx={{ textAlign: 'center' }}>
                <IconButton
                  onClick={handleLike}
                  disabled={liking}
                  sx={{ color: currentImage.user_liked ? 'error.main' : 'white' }}
                >
                  {currentImage.user_liked ? (
                    <FavoriteIcon />
                  ) : (
                    <FavoriteBorderIcon />
                  )}
                </IconButton>
                <Typography variant="caption" sx={{ color: 'white', display: 'block' }}>
                  {currentImage.like_count || 0}
                </Typography>
              </Box>

              {/* Download button */}
              <Box sx={{ textAlign: 'center' }}>
                <IconButton onClick={handleDownload} sx={{ color: 'white' }}>
                  <DownloadIcon />
                </IconButton>
                <Typography variant="caption" sx={{ color: 'white', display: 'block' }}>
                  Download
                </Typography>
              </Box>

              {/* Share button */}
              <Box sx={{ textAlign: 'center' }}>
                <IconButton onClick={handleShare} sx={{ color: 'white' }}>
                  <ShareIcon />
                </IconButton>
                <Typography variant="caption" sx={{ color: 'white', display: 'block' }}>
                  Share
                </Typography>
              </Box>
            </Box>

            {/* Photographer / uploader info */}
            {(currentImage.photographer_credit || currentImage.uploaded_by_name) && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  mt: 1,
                }}
              >
                <CameraAltIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
                <Typography
                  variant="caption"
                  sx={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {currentImage.photographer_credit || currentImage.uploaded_by_name}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default GalleryLightbox;
