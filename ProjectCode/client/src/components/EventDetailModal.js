import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Divider,
  CircularProgress
} from '@mui/material';
import CollectionsIcon from '@mui/icons-material/Collections';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getEventEngagement } from '../api';
import LikeButton from './LikeButton';
import ReactionPicker from './ReactionPicker';
import CommentSection from './CommentSection';
import AdminModerationPanel from './AdminModerationPanel';
import EventGalleryPreview from './EventGalleryPreview';

export default function EventDetailModal({ event, onClose }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);

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
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = (e) => {
    console.error('Image failed to load:', e.target.src);
    e.target.src = '/images/2025/20250517_bk_half.jpg';
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

  if (!event) return null;

  const eventTitle = event.name || event.title;
  const eventChineseTitle = event.chineseName || event.chineseTitle;

  return (
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
        <CardMedia
          component="img"
          height="300"
          image={event.image}
          alt={eventTitle}
          onError={handleImageError}
          sx={{
            objectFit: 'cover',
            backgroundColor: '#f5f5f5'
          }}
        />
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {eventTitle}
          </Typography>
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
                      style={{
                        color: '#FFB84D',
                        textDecoration: 'none',
                      }}
                    >
                      {part}
                    </a>
                  );
                }
                return part;
              })}
            </Typography>
          )}

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
                  />
                )}
                {engagement.reactions_enabled && (
                  <ReactionPicker
                    eventId={event.id}
                    reactions={engagement.reactions}
                    onUpdate={handleReactionsUpdate}
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

              {/* Gallery Section */}
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
      </Card>
    </Box>
  );
}
