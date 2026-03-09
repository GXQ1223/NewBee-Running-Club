import { useState } from 'react';
import {
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { deleteComment, toggleCommentHighlight, hideComment, unhideComment } from '../api';

export default function CommentItem({ comment, onUpdate, onDelete, onError }) {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [anchorEl, setAnchorEl] = useState(null);
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [hideReason, setHideReason] = useState('');
  const [loading, setLoading] = useState(false);

  const isOwnComment = (currentUser?.uid === comment.firebase_uid) || (currentUser?.uid && comment.member_id === currentUser.uid);
  const canModerate = adminModeEnabled;
  const canDelete = isOwnComment || canModerate;

  const handleMenuOpen = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = async () => {
    handleMenuClose();
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    setLoading(true);
    try {
      await deleteComment(comment.id, currentUser?.uid);
      if (onDelete) onDelete(comment.id);
    } catch (error) {
      console.error('Error deleting comment:', error);
      if (onError) onError('Failed to delete comment / 删除评论失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHighlight = async () => {
    handleMenuClose();
    setLoading(true);
    try {
      const result = await toggleCommentHighlight(comment.id, currentUser?.uid);
      if (onUpdate) onUpdate({ ...comment, is_highlighted: result.is_highlighted });
    } catch (error) {
      console.error('Error toggling highlight:', error);
      if (onError) onError('Failed to toggle highlight / 切换高亮失败');
    } finally {
      setLoading(false);
    }
  };

  const handleHideClick = () => {
    handleMenuClose();
    setHideDialogOpen(true);
  };

  const handleHideConfirm = async () => {
    if (!hideReason.trim()) return;

    setLoading(true);
    try {
      await hideComment(comment.id, hideReason, currentUser?.uid);
      if (onUpdate) onUpdate({ ...comment, is_hidden: true, hidden_reason: hideReason });
      setHideDialogOpen(false);
      setHideReason('');
    } catch (error) {
      console.error('Error hiding comment:', error);
      if (onError) onError('Failed to hide comment / 隐藏评论失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnhide = async () => {
    handleMenuClose();
    setLoading(true);
    try {
      await unhideComment(comment.id, currentUser?.uid);
      if (onUpdate) onUpdate({ ...comment, is_hidden: false, hidden_reason: null });
    } catch (error) {
      console.error('Error unhiding comment:', error);
      if (onError) onError('Failed to unhide comment / 取消隐藏失败');
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = comment.created_at
    ? formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })
    : '';

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          backgroundColor: comment.is_highlighted ? 'rgba(255, 184, 77, 0.08)' : 'transparent',
          border: comment.is_highlighted ? '1px solid rgba(255, 184, 77, 0.3)' : '1px solid transparent',
          opacity: comment.is_hidden ? 0.6 : 1,
          position: 'relative',
        }}
      >
        <Avatar
          src={comment.author_photo_url}
          alt={comment.author_name}
          sx={{ width: 36, height: 36 }}
        >
          {comment.author_name?.[0]?.toUpperCase()}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {comment.author_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {timeAgo}
            </Typography>
            {comment.is_highlighted && (
              <Chip
                icon={<StarIcon sx={{ fontSize: 14 }} />}
                label="Highlighted"
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  backgroundColor: 'rgba(255, 184, 77, 0.2)',
                  color: '#B8860B',
                  '& .MuiChip-icon': { color: '#FFB84D' },
                }}
              />
            )}
            {comment.is_hidden && canModerate && (
              <Chip
                icon={<VisibilityOffIcon sx={{ fontSize: 14 }} />}
                label="Hidden"
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                  color: '#d32f2f',
                }}
              />
            )}
          </Box>

          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {comment.content}
          </Typography>

          {comment.is_hidden && comment.hidden_reason && canModerate && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
              Reason: {comment.hidden_reason}
            </Typography>
          )}
        </Box>

        {(canDelete || canModerate) && (
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            disabled={loading}
            sx={{ alignSelf: 'flex-start' }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          onClick={(e) => e.stopPropagation()}
        >
          {canModerate && (
            <MenuItem onClick={handleToggleHighlight}>
              <StarIcon sx={{ mr: 1, fontSize: 18, color: comment.is_highlighted ? '#FFB84D' : '#757575' }} />
              {comment.is_highlighted ? 'Remove Highlight' : 'Highlight'}
            </MenuItem>
          )}
          {canModerate && !comment.is_hidden && (
            <MenuItem onClick={handleHideClick}>
              <VisibilityOffIcon sx={{ mr: 1, fontSize: 18 }} />
              Hide Comment
            </MenuItem>
          )}
          {canModerate && comment.is_hidden && (
            <MenuItem onClick={handleUnhide}>
              <VisibilityIcon sx={{ mr: 1, fontSize: 18 }} />
              Unhide Comment
            </MenuItem>
          )}
          {canDelete && (
            <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1, fontSize: 18 }} />
              Delete
            </MenuItem>
          )}
        </Menu>
      </Box>

      <Dialog
        open={hideDialogOpen}
        onClose={() => setHideDialogOpen(false)}
        onClick={(e) => e.stopPropagation()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Hide Comment</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please provide a reason for hiding this comment. This will be visible to admins.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Reason"
            value={hideReason}
            onChange={(e) => setHideReason(e.target.value)}
            placeholder="e.g., Inappropriate content, spam, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHideDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleHideConfirm}
            disabled={!hideReason.trim() || loading}
            variant="contained"
            color="error"
          >
            Hide
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
