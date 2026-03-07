import { useState, useEffect } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useAuth } from '../context/AuthContext';
import { getEventEngagement } from '../api';
import LikeButton from './LikeButton';
import ReactionPicker from './ReactionPicker';

export default function EventEngagementBar({ eventId, initialData = null, onDataLoaded }) {
  const { currentUser } = useAuth();
  const [engagement, setEngagement] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!initialData) {
      fetchEngagement();
    }
  }, [eventId, currentUser?.uid]);

  const fetchEngagement = async () => {
    setLoading(true);
    try {
      const data = await getEventEngagement(eventId, currentUser?.uid);
      setEngagement(data);
      if (onDataLoaded) {
        onDataLoaded(data);
      }
    } catch (err) {
      console.error('Error fetching engagement:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
        <Skeleton width={60} height={24} />
        <Skeleton width={100} height={24} />
        <Skeleton width={40} height={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography variant="caption" color="error" sx={{ mt: 1 }}>
        {error}
      </Typography>
    );
  }

  if (!engagement) {
    return null;
  }

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        mt: 1,
        pt: 1,
        borderTop: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Like Button */}
      {engagement.likes_enabled && (
        <LikeButton
          eventId={eventId}
          initialCount={engagement.likes.count}
          initialLiked={engagement.likes.user_liked}
          compact
          onUpdate={handleLikeUpdate}
        />
      )}

      {/* Reactions */}
      {engagement.reactions_enabled && (
        <ReactionPicker
          eventId={eventId}
          reactions={engagement.reactions}
          compact
          onUpdate={handleReactionsUpdate}
        />
      )}

      {/* Comment Count */}
      {engagement.comments_enabled && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: '#757575',
          }}
        >
          <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
          <Typography variant="body2">
            {engagement.comment_count}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
