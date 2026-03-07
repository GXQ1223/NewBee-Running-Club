import { useState, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import { useAuth } from '../context/AuthContext';
import { toggleLike, getEventLikes } from '../api';

export default function LikeButton({ eventId, initialCount = 0, initialLiked = false, disabled = false, compact = false, onUpdate, onError }) {
  const { currentUser } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  const handleToggleLike = async (e) => {
    e.stopPropagation();
    if (loading || disabled) return;

    setLoading(true);
    try {
      const result = await toggleLike(eventId, currentUser?.uid);
      setLiked(result.user_liked);
      setCount(result.count);
      if (onUpdate) {
        onUpdate(result);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      if (onError) onError('Failed to like / 点赞失败');
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <Box
        onClick={handleToggleLike}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: disabled ? 'default' : 'pointer',
          opacity: loading ? 0.5 : 1,
          '&:hover': !disabled && {
            '& .like-icon': {
              color: liked ? '#e53935' : '#ff8a80',
            }
          }
        }}
      >
        {liked ? (
          <FavoriteIcon className="like-icon" sx={{ fontSize: 18, color: '#e53935' }} />
        ) : (
          <FavoriteBorderIcon className="like-icon" sx={{ fontSize: 18, color: '#757575' }} />
        )}
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 16 }}>
          {count}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton
        onClick={handleToggleLike}
        disabled={loading || disabled}
        size="small"
        sx={{
          color: liked ? '#e53935' : '#757575',
          '&:hover': {
            color: liked ? '#c62828' : '#ff8a80',
            backgroundColor: 'rgba(229, 57, 53, 0.08)',
          },
        }}
      >
        {liked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
      </IconButton>
      <Typography variant="body2" color="text.secondary">
        {count}
      </Typography>
    </Box>
  );
}
