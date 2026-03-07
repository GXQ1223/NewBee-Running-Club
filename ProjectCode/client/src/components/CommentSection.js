import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Divider
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getEventComments, getAllEventComments, createComment } from '../api';
import CommentItem from './CommentItem';

export default function CommentSection({ eventId, commentsEnabled = true, onCommentCountChange }) {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchComments();
  }, [eventId, adminModeEnabled, currentUser?.uid]);

  const fetchComments = async () => {
    setLoading(true);
    setError(null);
    try {
      let fetchedComments;
      if (adminModeEnabled && currentUser?.uid) {
        fetchedComments = await getAllEventComments(eventId, currentUser.uid);
      } else {
        fetchedComments = await getEventComments(eventId);
      }
      setComments(fetchedComments);
      if (onCommentCountChange) {
        const visibleCount = fetchedComments.filter(c => !c.is_hidden).length;
        onCommentCountChange(visibleCount);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newComment.trim() || !currentUser?.uid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createComment(eventId, newComment.trim(), currentUser.uid);
      setComments([created, ...comments]);
      setNewComment('');
      if (onCommentCountChange) {
        onCommentCountChange(comments.length + 1);
      }
    } catch (err) {
      console.error('Error creating comment:', err);
      setError(err.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentUpdate = (updatedComment) => {
    setComments(comments.map(c => c.id === updatedComment.id ? updatedComment : c));
  };

  const handleCommentDelete = (commentId) => {
    setComments(comments.filter(c => c.id !== commentId));
    if (onCommentCountChange) {
      onCommentCountChange(comments.length - 1);
    }
  };

  // Filter hidden comments for non-admin view
  const displayedComments = adminModeEnabled
    ? comments
    : comments.filter(c => !c.is_hidden);

  return (
    <Box onClick={(e) => e.stopPropagation()}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ChatBubbleOutlineIcon sx={{ color: '#757575' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Comments ({displayedComments.length})
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Comment Input */}
      {commentsEnabled ? (
        currentUser ? (
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', gap: 1, mb: 3 }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submitting}
              multiline
              maxRows={4}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!newComment.trim() || submitting}
              sx={{
                minWidth: 'auto',
                px: 2,
                backgroundColor: '#FFB84D',
                '&:hover': { backgroundColor: '#FFA833' },
              }}
            >
              {submitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            </Button>
          </Box>
        ) : (
          <Alert severity="info" sx={{ mb: 3 }}>
            Please log in to leave a comment.
          </Alert>
        )
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Comments are disabled for this event.
        </Alert>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Comments List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress sx={{ color: '#FFB84D' }} />
        </Box>
      ) : displayedComments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No comments yet. Be the first to comment!
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {displayedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onUpdate={handleCommentUpdate}
              onDelete={handleCommentDelete}
              onError={(msg) => setError(msg)}
            />
          ))}
        </Box>
      )}

      {adminModeEnabled && comments.some(c => c.is_hidden) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Admin view: Showing {comments.filter(c => c.is_hidden).length} hidden comment(s)
        </Typography>
      )}
    </Box>
  );
}
