import { useState, useEffect } from 'react';
import { Box, Chip, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import { useAuth } from '../context/AuthContext';
import { toggleReaction, ALLOWED_EMOJIS } from '../api';

export default function ReactionPicker({ eventId, reactions = [], disabled = false, compact = false, onUpdate, onError }) {
  const { currentUser } = useAuth();
  const [localReactions, setLocalReactions] = useState(reactions);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalReactions(reactions);
  }, [reactions]);

  const handleOpenPicker = (e) => {
    e.stopPropagation();
    if (!disabled) {
      setAnchorEl(e.currentTarget);
    }
  };

  const handleClosePicker = () => {
    setAnchorEl(null);
  };

  const handleToggleReaction = async (emoji) => {
    if (loading || disabled) return;

    setLoading(true);
    try {
      const result = await toggleReaction(eventId, emoji, currentUser?.uid);
      setLocalReactions(result.reactions);
      if (onUpdate) {
        onUpdate(result.reactions);
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      if (onError) onError('Failed to react / 反应失败');
    } finally {
      setLoading(false);
      handleClosePicker();
    }
  };

  // Filter to only show reactions with counts > 0
  const activeReactions = localReactions.filter(r => r.count > 0);

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        {activeReactions.map((reaction) => (
          <Box
            key={reaction.emoji}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleReaction(reaction.emoji);
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.5,
              py: 0.25,
              borderRadius: 1,
              cursor: disabled ? 'default' : 'pointer',
              backgroundColor: reaction.user_reacted ? 'rgba(255, 184, 77, 0.2)' : 'transparent',
              border: reaction.user_reacted ? '1px solid #FFB84D' : '1px solid transparent',
              '&:hover': !disabled && {
                backgroundColor: 'rgba(255, 184, 77, 0.1)',
              },
            }}
          >
            <span style={{ fontSize: 14 }}>{reaction.emoji}</span>
            <Typography variant="caption" color="text.secondary">
              {reaction.count}
            </Typography>
          </Box>
        ))}
        <IconButton
          size="small"
          onClick={handleOpenPicker}
          disabled={disabled}
          sx={{
            width: 24,
            height: 24,
            color: '#757575',
            '&:hover': { color: '#FFB84D' },
          }}
        >
          <AddReactionOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>

        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleClosePicker}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Box sx={{ p: 1, display: 'flex', gap: 0.5 }}>
            {ALLOWED_EMOJIS.map((emoji) => {
              const reaction = localReactions.find(r => r.emoji === emoji);
              const isSelected = reaction?.user_reacted || false;
              return (
                <IconButton
                  key={emoji}
                  onClick={() => handleToggleReaction(emoji)}
                  disabled={loading}
                  sx={{
                    width: 36,
                    height: 36,
                    fontSize: 20,
                    backgroundColor: isSelected ? 'rgba(255, 184, 77, 0.2)' : 'transparent',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 184, 77, 0.3)',
                      transform: 'scale(1.2)',
                    },
                    transition: 'transform 0.1s ease-in-out',
                  }}
                >
                  {emoji}
                </IconButton>
              );
            })}
          </Box>
        </Popover>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {activeReactions.map((reaction) => (
        <Tooltip key={reaction.emoji} title={`${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}>
          <Chip
            label={`${reaction.emoji} ${reaction.count}`}
            onClick={() => handleToggleReaction(reaction.emoji)}
            disabled={disabled}
            size="small"
            sx={{
              backgroundColor: reaction.user_reacted ? 'rgba(255, 184, 77, 0.2)' : 'rgba(0, 0, 0, 0.04)',
              border: reaction.user_reacted ? '1px solid #FFB84D' : '1px solid transparent',
              '&:hover': {
                backgroundColor: reaction.user_reacted ? 'rgba(255, 184, 77, 0.3)' : 'rgba(0, 0, 0, 0.08)',
              },
              cursor: 'pointer',
            }}
          />
        </Tooltip>
      ))}

      <Tooltip title="Add reaction">
        <IconButton
          onClick={handleOpenPicker}
          disabled={disabled}
          size="small"
          sx={{
            color: '#757575',
            '&:hover': {
              color: '#FFB84D',
              backgroundColor: 'rgba(255, 184, 77, 0.08)',
            },
          }}
        >
          <AddReactionOutlinedIcon />
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClosePicker}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Pick a reaction
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {ALLOWED_EMOJIS.map((emoji) => {
              const reaction = localReactions.find(r => r.emoji === emoji);
              const isSelected = reaction?.user_reacted || false;
              return (
                <IconButton
                  key={emoji}
                  onClick={() => handleToggleReaction(emoji)}
                  disabled={loading}
                  sx={{
                    width: 40,
                    height: 40,
                    fontSize: 24,
                    backgroundColor: isSelected ? 'rgba(255, 184, 77, 0.2)' : 'transparent',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 184, 77, 0.3)',
                      transform: 'scale(1.2)',
                    },
                    transition: 'transform 0.1s ease-in-out',
                  }}
                >
                  {emoji}
                </IconButton>
              );
            })}
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
