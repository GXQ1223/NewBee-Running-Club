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
  TextField,
  IconButton,
  Snackbar,
  Alert,
  Tooltip,
  MenuItem,
  FormControlLabel,
  Switch
} from '@mui/material';
import CollectionsIcon from '@mui/icons-material/Collections';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import ShareIcon from '@mui/icons-material/Share';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import ImagePositionEditor from './ImagePositionEditor';
import { getEventEngagement, updateEvent, getEventById } from '../api';
import LikeButton from './LikeButton';
import ReactionPicker from './ReactionPicker';
import CommentSection from './CommentSection';
import AdminModerationPanel from './AdminModerationPanel';
import EventGalleryPreview from './EventGalleryPreview';

export default function EventDetailModal({ event, onClose, onEventUpdate }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareSnackbar, setShareSnackbar] = useState(false);
  const [errorSnackbar, setErrorSnackbar] = useState({ open: false, message: '' });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const handleEditOpen = async () => {
    // Fetch authoritative server state. The `event` prop from
    // CalendarPage/HighlightsPage is a transformed projection that drops
    // fields like is_highlight, so pre-filling from the prop could silently
    // flip flags off when admin saves a no-op edit.
    setEditing(true);
    let fresh = event;
    try {
      if (event?.id) fresh = await getEventById(event.id);
    } catch (err) {
      console.error('Failed to load event for edit, falling back to prop:', err);
    }
    setEditForm({
      name: fresh.name || fresh.title || '',
      chinese_name: fresh.chinese_name ?? fresh.chineseName ?? fresh.chineseTitle ?? '',
      date: fresh.date || '',
      time: fresh.time || '',
      location: fresh.location || '',
      chinese_location: fresh.chinese_location ?? fresh.chineseLocation ?? '',
      description: fresh.description || '',
      chinese_description: fresh.chinese_description ?? fresh.chineseDescription ?? '',
      image: fresh.image || '',
      signup_link: fresh.signup_link ?? fresh.signupLink ?? '',
      wechat_qr_code: fresh.wechat_qr_code ?? fresh.wechatQrCode ?? '',
      status: fresh.status === 'Highlight' ? 'Past' : (fresh.status || 'Upcoming'),
      is_highlight: fresh.is_highlight === true || fresh.status === 'Highlight',
      event_type: fresh.event_type || fresh.eventType || 'standard',
    });
  };

  const handleEditCancel = () => {
    setEditing(false);
    setEditForm(null);
  };

  const handleEditFieldChange = (field) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value;
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEditSave = async () => {
    if (!editForm) return;
    const trimmedName = (editForm.name || '').trim();
    if (!trimmedName) {
      setErrorSnackbar({ open: true, message: 'Name cannot be empty / 名称不能为空' });
      return;
    }
    if (!editForm.date) {
      setErrorSnackbar({ open: true, message: 'Date is required / 日期为必填项' });
      return;
    }
    setSaving(true);
    try {
      // Send every field so admins can clear values too. Empty strings → null
      // so the server stores NULL instead of "".
      const payload = {
        name: trimmedName,
        chinese_name: editForm.chinese_name?.trim() || null,
        date: editForm.date,
        time: editForm.time?.trim() || null,
        location: editForm.location?.trim() || null,
        chinese_location: editForm.chinese_location?.trim() || null,
        description: editForm.description ?? null,
        chinese_description: editForm.chinese_description ?? null,
        image: editForm.image?.trim() || null,
        signup_link: editForm.signup_link?.trim() || null,
        wechat_qr_code: editForm.wechat_qr_code?.trim() || null,
        status: editForm.status,
        is_highlight: !!editForm.is_highlight,
        event_type: editForm.event_type || 'standard',
      };
      const updated = await updateEvent(event.id, payload, currentUser.uid);
      setEditing(false);
      setEditForm(null);
      if (onEventUpdate) {
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
      }
    } catch (error) {
      console.error('Error updating event:', error);
      setErrorSnackbar({ open: true, message: 'Failed to save event / 保存活动失败' });
    } finally {
      setSaving(false);
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
              image={event.image}
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
          {editing && editForm ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Event Name / 活动名称"
                  value={editForm.name}
                  onChange={handleEditFieldChange('name')}
                  fullWidth
                  size="small"
                  required
                />
                <TextField
                  label="Chinese Name / 中文名称"
                  value={editForm.chinese_name}
                  onChange={handleEditFieldChange('chinese_name')}
                  fullWidth
                  size="small"
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Date / 日期"
                  type="date"
                  value={editForm.date}
                  onChange={handleEditFieldChange('date')}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  required
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Time / 时间"
                  value={editForm.time}
                  onChange={handleEditFieldChange('time')}
                  size="small"
                  placeholder="e.g. 8:00 AM"
                  sx={{ flex: 1 }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Location / 地点"
                  value={editForm.location}
                  onChange={handleEditFieldChange('location')}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Chinese Location / 中文地点"
                  value={editForm.chinese_location}
                  onChange={handleEditFieldChange('chinese_location')}
                  size="small"
                  fullWidth
                />
              </Box>
              <TextField
                label="Image URL / 图片链接"
                value={editForm.image}
                onChange={handleEditFieldChange('image')}
                size="small"
                fullWidth
                placeholder="https://… or /path/to/image.jpg"
              />
              <TextField
                label="Signup Link / 报名链接"
                value={editForm.signup_link}
                onChange={handleEditFieldChange('signup_link')}
                size="small"
                fullWidth
              />
              <TextField
                label="WeChat QR Code URL / 微信二维码"
                value={editForm.wechat_qr_code}
                onChange={handleEditFieldChange('wechat_qr_code')}
                size="small"
                fullWidth
              />
              <TextField
                label="Description / 描述"
                value={editForm.description}
                onChange={handleEditFieldChange('description')}
                multiline
                minRows={2}
                size="small"
                fullWidth
              />
              <TextField
                label="Chinese Description / 中文描述"
                value={editForm.chinese_description}
                onChange={handleEditFieldChange('chinese_description')}
                multiline
                minRows={2}
                size="small"
                fullWidth
              />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  select
                  label="Status / 状态"
                  value={editForm.status}
                  onChange={handleEditFieldChange('status')}
                  size="small"
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="Upcoming">Upcoming / 即将举行</MenuItem>
                  <MenuItem value="Past">Past / 已结束</MenuItem>
                  <MenuItem value="Cancelled">Cancelled / 已取消</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Type / 类型"
                  value={editForm.event_type}
                  onChange={handleEditFieldChange('event_type')}
                  size="small"
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="standard">Standard</MenuItem>
                  <MenuItem value="heylo">Heylo</MenuItem>
                  <MenuItem value="race">Race</MenuItem>
                </TextField>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!editForm.is_highlight}
                      onChange={(e) =>
                        setEditForm(prev => ({ ...prev, is_highlight: e.target.checked }))
                      }
                      color="warning"
                    />
                  }
                  label="★ Highlight"
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={handleEditCancel}
                  disabled={saving}
                  startIcon={<CloseIcon />}
                  sx={{ borderColor: '#f44336', color: '#f44336' }}
                >
                  Cancel / 取消
                </Button>
                <Button
                  variant="contained"
                  onClick={handleEditSave}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                  sx={{ backgroundColor: '#4caf50', '&:hover': { backgroundColor: '#43a047' } }}
                >
                  Save / 保存
                </Button>
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h5" gutterBottom sx={{ mb: 0, flex: 1, minWidth: 0 }}>
                  {eventTitle}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {adminModeEnabled && event.id && (
                    <Tooltip title="Edit event / 编辑活动">
                      <IconButton onClick={handleEditOpen} sx={{ color: '#FFB84D' }}>
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
