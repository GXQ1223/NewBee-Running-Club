import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  IconButton,
  Skeleton,
  Alert,
  Breadcrumbs,
  Link,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { useParams, useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import FlagIcon from '@mui/icons-material/Flag';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { getEventGallery, toggleGalleryImageLike, deleteGalleryImage, requestGalleryImageDeletion, resolveGalleryDeletionRequest } from '../api/gallery';
import { getEventById } from '../api/events';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import GalleryLightbox from '../components/GalleryLightbox';
import GalleryUploadButton from '../components/GalleryUploadButton';

/**
 * GalleryPage - Full gallery view for an event with grid layout
 */
const GalleryPage = () => {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { adminModeEnabled, memberData } = useAdmin();

  const [event, setEvent] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);

  // Deletion request state
  const [requestDeleteDialogOpen, setRequestDeleteDialogOpen] = useState(false);
  const [imageToRequestDelete, setImageToRequestDelete] = useState(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });

  // Admin review state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [requestToReview, setRequestToReview] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Permission check: admin OR uploader can delete
  const canDelete = (image) => {
    if (adminModeEnabled) return true;
    if (currentUser && memberData && image.uploaded_by_id) {
      return image.uploaded_by_id === memberData.id;
    }
    return false;
  };

  // Fetch event and gallery data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [eventData, galleryData] = await Promise.all([
          getEventById(eventId),
          getEventGallery(eventId, currentUser?.uid),
        ]);

        setEvent(eventData);
        setImages(galleryData);

        // Check if we should open lightbox to specific image
        const imageParam = searchParams.get('image');
        if (imageParam) {
          const imageIndex = galleryData.findIndex(
            (img) => img.id === parseInt(imageParam)
          );
          if (imageIndex >= 0) {
            setLightboxIndex(imageIndex);
            setLightboxOpen(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch gallery:', err);
        setError(err.message || 'Failed to load gallery');
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      fetchData();
    }
  }, [eventId, currentUser?.uid, searchParams]);

  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleLike = async (e, imageId) => {
    e.stopPropagation();

    try {
      const result = await toggleGalleryImageLike(imageId, currentUser?.uid);
      setImages((prevImages) =>
        prevImages.map((img) =>
          img.id === imageId
            ? { ...img, like_count: result.like_count, user_liked: result.user_liked }
            : img
        )
      );
    } catch (err) {
      console.error('Failed to toggle like:', err);
      setSnackbar({ open: true, message: 'Failed to like image / 点赞失败', severity: 'error' });
    }
  };

  const handleImageUpdate = (imageId, updates) => {
    setImages((prevImages) =>
      prevImages.map((img) =>
        img.id === imageId ? { ...img, ...updates } : img
      )
    );
  };

  const handleUploadSuccess = (newImage) => {
    setImages((prevImages) => [newImage, ...prevImages]);
  };

  const handleDeleteClick = (e, imageId) => {
    e.stopPropagation();
    const image = images.find((img) => img.id === imageId);
    setImageToDelete(image);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!imageToDelete) return;

    try {
      await deleteGalleryImage(imageToDelete.id, currentUser.uid);
      setImages((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      setDeleteDialogOpen(false);
      setImageToDelete(null);
    } catch (error) {
      console.error('Failed to delete image:', error);
      setSnackbar({ open: true, message: 'Failed to delete image / 删除图片失败', severity: 'error' });
    }
  };

  // --- Request Deletion (any logged-in user) ---
  const handleRequestDeleteClick = (e, image) => {
    e.stopPropagation();
    setImageToRequestDelete(image);
    setDeletionReason('');
    setRequestDeleteDialogOpen(true);
  };

  const openRequestDeleteDialog = (image) => {
    setImageToRequestDelete(image);
    setDeletionReason('');
    setRequestDeleteDialogOpen(true);
  };

  const handleRequestDeleteSubmit = async () => {
    if (!imageToRequestDelete || !deletionReason.trim()) return;
    setRequestLoading(true);
    try {
      await requestGalleryImageDeletion(imageToRequestDelete.id, deletionReason.trim(), currentUser.uid);
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageToRequestDelete.id
            ? { ...img, user_requested_deletion: true, has_pending_deletion_request: true }
            : img
        )
      );
      setRequestDeleteDialogOpen(false);
    } catch (err) {
      console.error('Failed to submit deletion request:', err);
      setSnackbar({ open: true, message: 'Failed to submit request / 提交请求失败', severity: 'error' });
    } finally {
      setRequestLoading(false);
    }
  };

  // --- Admin Review ---
  const handleReviewClick = (e, image) => {
    e.stopPropagation();
    setRequestToReview({ image, deletionRequest: image.deletion_request });
    setReviewDialogOpen(true);
  };

  const handleReviewResolve = async (approved) => {
    if (!requestToReview?.deletionRequest) return;
    setReviewLoading(true);
    try {
      await resolveGalleryDeletionRequest(requestToReview.deletionRequest.id, approved, currentUser.uid);
      if (approved) {
        setImages((prev) => prev.filter((img) => img.id !== requestToReview.image.id));
      } else {
        setImages((prev) =>
          prev.map((img) =>
            img.id === requestToReview.image.id
              ? { ...img, has_pending_deletion_request: false, deletion_request: null }
              : img
          )
        );
      }
      setReviewDialogOpen(false);
    } catch (err) {
      console.error('Failed to resolve deletion request:', err);
      setSnackbar({ open: true, message: 'Failed to resolve request / 处理请求失败', severity: 'error' });
    } finally {
      setReviewLoading(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="text" width={200} height={30} sx={{ mb: 4 }} />
        <Grid container spacing={2}>
          {[...Array(8)].map((_, i) => (
            <Grid item xs={6} sm={4} md={3} key={i}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumb navigation */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/" color="inherit">
          Home
        </Link>
        <Link component={RouterLink} to="/highlights" color="inherit">
          Events
        </Link>
        {event && (
          <Typography color="text.primary">{event.name}</Typography>
        )}
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <IconButton onClick={() => navigate(-1)} sx={{ ml: -1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" component="h1">
              Event Gallery
            </Typography>
            <Typography variant="h6" color="text.secondary">
              活动相册
            </Typography>
          </Box>
        </Box>

        {event && (
          <Box sx={{ ml: 6 }}>
            <Typography variant="h5" sx={{ mb: 0.5 }}>
              {event.name}
            </Typography>
            {event.chinese_name && (
              <Typography variant="body1" color="text.secondary">
                {event.chinese_name}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {event.date && (
                <Chip
                  size="small"
                  label={new Date(event.date).toLocaleDateString()}
                  variant="outlined"
                />
              )}
              <Chip
                size="small"
                label={`${images.length} photos`}
                variant="outlined"
              />
              {currentUser && images.length > 0 && (
                <GalleryUploadButton
                  eventId={eventId}
                  onUploadSuccess={handleUploadSuccess}
                  variant="button"
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Empty state */}
      {images.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            bgcolor: 'grey.50',
            borderRadius: 2,
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No photos yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            还没有照片，快来上传第一张吧！
          </Typography>
          {currentUser && (
            <Box sx={{ mt: 2 }}>
              <GalleryUploadButton
                eventId={eventId}
                onUploadSuccess={handleUploadSuccess}
                variant="button"
              />
            </Box>
          )}
        </Box>
      ) : (
        /* Image grid */
        <Grid container spacing={2}>
          {images.map((image, index) => (
            <Grid item xs={6} sm={4} md={3} key={image.id}>
              <Card
                onClick={() => handleImageClick(index)}
                sx={{
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'scale(1.02)',
                    boxShadow: 4,
                  },
                }}
              >
                {/* Square image container */}
                <Box sx={{ position: 'relative', paddingTop: '100%', overflow: 'hidden', backgroundColor: '#f5f5f5' }}>
                  <Box
                    component="img"
                    src={image.image_url}
                    alt={image.caption || 'Gallery image'}
                    loading="lazy"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />

                  {/* Like button overlay - top right */}
                  <IconButton
                    size="small"
                    onClick={(e) => handleLike(e, image.id)}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'rgba(255,255,255,0.85)',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.95)' },
                      color: image.user_liked ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {image.user_liked ? (
                      <FavoriteIcon fontSize="small" />
                    ) : (
                      <FavoriteBorderIcon fontSize="small" />
                    )}
                  </IconButton>

                  {/* Delete button overlay - bottom right (conditional) */}
                  {canDelete(image) && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleDeleteClick(e, image.id)}
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.95)' },
                        color: 'text.secondary',
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}

                  {/* Request deletion button - bottom left (logged-in non-admin/non-uploader) */}
                  {currentUser && !canDelete(image) && !image.user_requested_deletion && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleRequestDeleteClick(e, image)}
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.95)' },
                        color: 'text.secondary',
                      }}
                    >
                      <FlagIcon fontSize="small" />
                    </IconButton>
                  )}

                  {/* "Requested" indicator - bottom left */}
                  {currentUser && image.user_requested_deletion && !canDelete(image) && (
                    <Chip
                      size="small"
                      label="Requested"
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        backgroundColor: 'rgba(255,152,0,0.9)',
                        color: 'white',
                        fontSize: '0.65rem',
                        height: 22,
                      }}
                    />
                  )}

                  {/* Admin: red "Delete Request" chip */}
                  {adminModeEnabled && image.has_pending_deletion_request && (
                    <Chip
                      size="small"
                      icon={<ReportProblemIcon sx={{ fontSize: 14, color: 'white !important' }} />}
                      label="Delete Request"
                      onClick={(e) => handleReviewClick(e, image)}
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: 8,
                        backgroundColor: 'rgba(211,47,47,0.9)',
                        color: 'white',
                        fontSize: '0.65rem',
                        height: 22,
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: 'rgba(211,47,47,1)' },
                      }}
                    />
                  )}

                  {/* Like count badge - top left */}
                  {image.like_count > 0 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        borderRadius: '12px',
                        px: 1,
                        py: 0.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <FavoriteIcon sx={{ fontSize: 14, color: 'error.main' }} />
                      <Typography variant="caption" fontWeight="medium">
                        {image.like_count}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Footer info */}
                <CardContent sx={{ py: 1, px: 1.5 }}>
                  {image.uploaded_by_name && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {image.uploaded_by_name}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Upload FAB for authenticated users */}
      {currentUser && images.length > 0 && (
        <GalleryUploadButton
          eventId={eventId}
          onUploadSuccess={handleUploadSuccess}
          variant="fab"
        />
      )}

      {/* Lightbox */}
      <GalleryLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={images}
        initialIndex={lightboxIndex}
        onImageUpdate={handleImageUpdate}
        eventId={eventId}
        onRequestDelete={openRequestDeleteDialog}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Image?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this image? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Deletion Dialog */}
      <Dialog
        open={requestDeleteDialogOpen}
        onClose={() => setRequestDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Request Image Deletion / 申请删除图片</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            Please provide a reason for requesting this image to be removed. A committee member will review your request.
          </DialogContentText>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
            请提供申请删除此图片的原因。委员会成员将审核您的请求。
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Reason / 原因"
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            placeholder="Why should this image be removed?"
            required
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRequestDeleteDialogOpen(false)}>Cancel / 取消</Button>
          <Button
            onClick={handleRequestDeleteSubmit}
            variant="contained"
            color="warning"
            disabled={!deletionReason.trim() || requestLoading}
          >
            {requestLoading ? <CircularProgress size={20} /> : 'Submit Request / 提交申请'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Admin: Review Deletion Request Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Review Deletion Request / 审核删除请求</DialogTitle>
        <DialogContent>
          {requestToReview?.deletionRequest && (
            <>
              <DialogContentText sx={{ mb: 1 }}>
                <strong>Requested by / 申请人:</strong> {requestToReview.deletionRequest.requested_by_name}
              </DialogContentText>
              <DialogContentText sx={{ mb: 2 }}>
                <strong>Reason / 原因:</strong> {requestToReview.deletionRequest.reason}
              </DialogContentText>
              <DialogContentText sx={{ color: 'text.secondary' }}>
                Approving will permanently delete this image. Rejecting will dismiss the request.
              </DialogContentText>
              <DialogContentText sx={{ color: 'text.secondary' }}>
                批准将永久删除此图片。拒绝将驳回此请求。
              </DialogContentText>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReviewDialogOpen(false)}>Cancel / 取消</Button>
          <Button
            onClick={() => handleReviewResolve(false)}
            variant="outlined"
            disabled={reviewLoading}
          >
            Reject / 拒绝
          </Button>
          <Button
            onClick={() => handleReviewResolve(true)}
            variant="contained"
            color="error"
            disabled={reviewLoading}
          >
            {reviewLoading ? <CircularProgress size={20} /> : 'Approve Delete / 批准删除'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default GalleryPage;
