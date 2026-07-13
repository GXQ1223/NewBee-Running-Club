import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Divider,
  CircularProgress,
  IconButton,
  Snackbar,
  Alert,
  Tooltip
} from '@mui/material';
import CollectionsIcon from '@mui/icons-material/Collections';
import EditIcon from '@mui/icons-material/Edit';
import ShareIcon from '@mui/icons-material/Share';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import ImagePositionEditor from './ImagePositionEditor';
import EventComposer from './EventComposer';
import { getEventEngagement, getEventById } from '../api';
import LikeButton from './LikeButton';
import ReactionPicker from './ReactionPicker';
import CommentSection from './CommentSection';
import AdminModerationPanel from './AdminModerationPanel';
import EventGalleryPreview from './EventGalleryPreview';
import { FALLBACK_EVENT_IMAGE } from '../theme/tokens';

export default function EventDetailModal({ event, onClose, onEventUpdate }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareSnackbar, setShareSnackbar] = useState(false);
  const [errorSnackbar, setErrorSnackbar] = useState({ open: false, message: '' });
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (event?.id) {
      fetchEngagement();
    }
  }, [event?.id, currentUser?.uid]);

  const fetchEngagement = async () => {
    setLoading(true);
    try {
      const data = await getEventEngagement(event.id, currentUser?.uid);
      setEngagement(data);
    } catch (error) {
      console.error('Error fetching engagement:', error);
      setErrorSnackbar({ open: true, message: 'Failed to load engagement / 加载互动失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/calendar?event=${event.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareSnackbar(true);
    });
  };

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = FALLBACK_EVENT_IMAGE;
  };

  const handleLikeUpdate = (result) => {
    if (engagement) {
      setEngagement({
        ...engagement,
        likes: result,
      });
    }
  };

  const handleReactionsUpdate = (reactions) => {
    if (engagement) {
      setEngagement({
        ...engagement,
        reactions,
      });
    }
  };

  const handleComposerSaved = async (saved) => {
    if (!onEventUpdate) return;
    // Re-fetch authoritative server state — the composer's save response may
    // not include every field the parent page caches.
    let updated = saved;
    try {
      if (event?.id) updated = await getEventById(event.id);
    } catch (err) {
      console.error('Failed to refresh event after save, using save response:', err);
    }
    // Mirror to camelCase so pages that cache that shape (CalendarPage,
    // HighlightsPage) re-render with the new values immediately.
    onEventUpdate({
      ...event,
      ...updated,
      chineseName: updated.chinese_name,
      chineseLocation: updated.chinese_location,
      chineseDescription: updated.chinese_description,
      signupLink: updated.signup_link,
      wechatQrCode: updated.wechat_qr_code,
    });
  };

  const handleSettingsUpdate = (settings) => {
    if (engagement) {
      setEngagement({
        ...engagement,
        comments_enabled: settings.comments_enabled,
        likes_enabled: settings.likes_enabled,
        reactions_enabled: settings.reactions_enabled,
      });
    }
  };

  const [imagePosition, setImagePosition] = useState('center center');
  const eventTitle = event?.name || event?.title;
  const eventChineseTitle = event?.chineseName || event?.chineseTitle;

  useEffect(() => {
    if (event) {
      setImagePosition(event.image_position || event.imagePosition || 'center center');
    }
  }, [event]);

  if (!event) return null;

  return ReactDOM.createPortal(
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999  // Highest z-index to overlay on top of everything including nav bar and modals
      }}
      onClick={onClose}
    >
      <Card
        sx={{
          maxWidth: 700,
          width: '95%',
          maxHeight: '95vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ position: 'relative' }}>
          {adminModeEnabled && event.id ? (
            <ImagePositionEditor
              eventId={event.id}
              imageUrl={event.image}
              currentPosition={imagePosition}
              onPositionSaved={(pos) => {
                setImagePosition(pos);
                if (onEventUpdate) onEventUpdate({ ...event, image_position: pos });
              }}
              sx={{ height: 300, backgroundColor: '#f5f5f5' }}
            />
          ) : (
            <CardMedia
              component="img"
              height="300"
              image={event.image || FALLBACK_EVENT_IMAGE}
              alt={eventTitle}
              onError={handleImageError}
              sx={{
                objectFit: 'cover',
                objectPosition: imagePosition,
                backgroundColor: '#f5f5f5'
              }}
            />
          )}
          {(event.wechatQrCode || event.wechat_qr_code) && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                width: 80,
                height: 80,
                backgroundColor: 'white',
                borderRadius: 1,
                padding: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src={event.wechatQrCode || event.wechat_qr_code}
                alt="WeChat QR Code"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </Box>
          )}
        </Box>
        <CardContent>
          <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h5" gutterBottom sx={{ mb: 0, flex: 1, minWidth: 0 }}>
                  {eventTitle}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {adminModeEnabled && event.id && (
                    <Tooltip title="Edit event / 编辑活动">
                      <IconButton onClick={() => setComposerOpen(true)} sx={{ color: '#FFB84D' }}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Share / 分享">
                    <IconButton onClick={handleShare} sx={{ color: '#FFB84D' }}>
                      <ShareIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              {eventChineseTitle && (
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {eventChineseTitle}
                </Typography>
              )}

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Date: {event.date}
                </Typography>
                {event.time && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Time: {event.time}
                  </Typography>
                )}
                {event.location && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Location: {event.location}
                  </Typography>
                )}
                {event.chineseLocation && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {event.chineseLocation}
                  </Typography>
                )}
              </Box>

              {(event.signupLink || event.signup_link) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Join / 参与
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    href={event.signupLink || event.signup_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      textTransform: 'none',
                      borderColor: '#FFB84D',
                      color: '#FFB84D',
                      borderRadius: '8px',
                      '&:hover': { borderColor: '#FFA833', backgroundColor: 'rgba(255, 184, 77, 0.04)' }
                    }}
                  >
                    Sign Up / 报名
                  </Button>
                </Box>
              )}

              {event.description && (
                <Typography variant="body1" paragraph sx={{ whiteSpace: 'pre-line' }}>
                  {event.description.split(/(@?https?:\/\/[^\s]+)/g).map((part, index) => {
                    if (part.match(/^@?https?:\/\//)) {
                      return (
                        <a
                          key={index}
                          href={part.startsWith('@') ? part.substring(1) : part}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#FFB84D', textDecoration: 'none' }}
                        >
                          {part}
                        </a>
                      );
                    }
                    return part;
                  })}
                </Typography>
              )}
              {(event.chineseDescription || event.chinese_description) && (
                <Typography
                  variant="body1"
                  paragraph
                  color="text.secondary"
                  sx={{ whiteSpace: 'pre-line' }}
                >
                  {event.chineseDescription || event.chinese_description}
                </Typography>
              )}
          </>

          <Divider sx={{ my: 2 }} />

          {/* Engagement Section */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#FFB84D' }} />
            </Box>
          ) : engagement ? (
            <>
              {/* Like and Reactions Row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                {engagement.likes_enabled && (
                  <LikeButton
                    eventId={event.id}
                    initialCount={engagement.likes.count}
                    initialLiked={engagement.likes.user_liked}
                    onUpdate={handleLikeUpdate}
                    onError={(msg) => setErrorSnackbar({ open: true, message: msg })}
                  />
                )}
                {engagement.reactions_enabled && (
                  <ReactionPicker
                    eventId={event.id}
                    reactions={engagement.reactions}
                    onUpdate={handleReactionsUpdate}
                    onError={(msg) => setErrorSnackbar({ open: true, message: msg })}
                  />
                )}
              </Box>

              {/* Admin Moderation Panel */}
              {adminModeEnabled && (
                <AdminModerationPanel
                  eventId={event.id}
                  settings={{
                    comments_enabled: engagement.comments_enabled,
                    likes_enabled: engagement.likes_enabled,
                    reactions_enabled: engagement.reactions_enabled,
                  }}
                  onSettingsUpdate={handleSettingsUpdate}
                />
              )}

              {/* Gallery Section - hidden for Upcoming events */}
              {event.status !== 'Upcoming' && (
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CollectionsIcon sx={{ color: 'text.secondary' }} />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Photos / 相册
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      onClick={() => {
                        onClose();
                        navigate(`/events/${event.id}/gallery`);
                      }}
                      sx={{ textTransform: 'none', color: '#FFB84D' }}
                    >
                      View All
                    </Button>
                  </Box>
                  <EventGalleryPreview eventId={event.id} maxImages={5} size={56} />
                </Box>
              )}

              <Divider sx={{ mb: 3 }} />

              {/* Comments Section */}
              <CommentSection
                eventId={event.id}
                commentsEnabled={engagement.comments_enabled}
              />
            </>
          ) : null}

          <Box sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              onClick={onClose}
              sx={{
                color: '#FFB84D',
                borderColor: '#FFB84D',
                textTransform: 'none',
                fontSize: '16px',
                px: 2,
                py: 1.5,
                borderRadius: '12px',
                '&:hover': {
                  borderColor: '#FFA833',
                  backgroundColor: 'rgba(255, 184, 77, 0.04)',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                  transform: 'translateY(-2px)',
                },
                '&:active': {
                  transform: 'translateY(1px) scale(0.98)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }
              }}
            >
              Close 关闭
            </Button>
          </Box>
        </CardContent>
        {/* Rendered inside the Card so click events bubbling through the
            portal are stopped before the overlay's onClick={onClose}. The
            composer must stack above this modal's zIndex: 9999 overlay. */}
        <EventComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          event={event}
          onSaved={handleComposerSaved}
          sx={{ zIndex: 10000 }}
        />
      </Card>
      <Snackbar
        open={shareSnackbar}
        autoHideDuration={3000}
        onClose={() => setShareSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShareSnackbar(false)} severity="success" sx={{ width: '100%' }}>
          Link copied / 链接已复制
        </Alert>
      </Snackbar>
      <Snackbar
        open={errorSnackbar.open}
        autoHideDuration={4000}
        onClose={() => setErrorSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorSnackbar({ open: false, message: '' })} severity="error" sx={{ width: '100%' }}>
          {errorSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>,
    document.body
  );
}
