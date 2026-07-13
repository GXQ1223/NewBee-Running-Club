import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Snackbar, Step, StepLabel, Stepper,
  Switch, TextField, Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RepeatIcon from '@mui/icons-material/Repeat';
import EventCard from './EventCard';
import { useAuth } from '../context';
import { useAutoFillOnTab, useTranslationAutoFill } from '../hooks';
import {
  createEvent, updateEvent, getEventWithRecurrence,
  createEventRecurrence, updateEventRecurrence, deleteEventRecurrence,
} from '../api';
import { uploadImage } from '../api/homepageSections';
import { ORANGE, ORANGE_DARK, MUTED } from '../theme/tokens';
import { to24Hour, to12Hour } from '../helpers/eventDate';

const STEPS = ['Basics 基本', 'Details 详情', 'Publish 发布'];

const emptyForm = {
  name: '',
  chinese_name: '',
  date: '',
  time: '',
  location: '',
  chinese_location: '',
  description: '',
  chinese_description: '',
  image: '',
  signup_link: '',
  status: 'Upcoming',
  is_highlight: false,
  event_type: 'standard',
  heylo_embed: '',
  wechat_qr_code: '',
  // Recurrence (synced via dedicated rule endpoints, not the event payload)
  is_recurring: false,
  recurrence_type: 'weekly',
  days_of_week: '',
  day_of_month: '',
  week_of_month: '',
  month_of_year: '',
  recurrence_end_date: '',
};

function isValidUrl(value) {
  return !value || /^https?:\/\/\S+/.test(value);
}

/**
 * The single event create/edit dialog — a 3-step composer with a live
 * EventCard preview. Mounted from CalendarPage, AdminPanelPage and
 * EventDetailModal; replaces the three divergent editors those surfaces
 * used to carry.
 *
 * Props:
 *   open      — dialog visibility
 *   onClose   — close without saving
 *   event     — event to edit (any of the cached field shapes; re-fetched
 *               by id for authoritative state) or null to create
 *   onSaved   — called with the saved event after a successful save
 */
export default function EventComposer({ open, onClose, event = null, onSaved, sx = {} }) {
  const { currentUser } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState(emptyForm);
  const [hadRecurrenceRule, setHadRecurrenceRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [touched, setTouched] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const imageInputRef = useRef(null);
  const qrInputRef = useRef(null);

  const isEditing = Boolean(event?.id);

  useEffect(() => {
    if (!open) return;
    setActiveStep(0);
    setTouched(false);
    setHadRecurrenceRule(false);
    if (!event?.id) {
      // Create mode: date defaults to today so the quickest path is name → save
      setFormData({ ...emptyForm, date: new Date().toISOString().split('T')[0] });
      return;
    }
    // Edit mode: re-fetch authoritative state — page caches are transformed
    // projections that drop fields like is_highlight or wechat_qr_code
    let cancelled = false;
    (async () => {
      let fresh = event;
      let recurrence = null;
      try {
        const withRule = await getEventWithRecurrence(event.id);
        fresh = withRule;
        recurrence = withRule.recurrence || null;
      } catch (err) {
        console.error('Error fetching event for editing:', err);
      }
      if (cancelled) return;
      setFormData({
        name: fresh.name ?? fresh.title ?? '',
        chinese_name: fresh.chinese_name ?? fresh.chineseName ?? fresh.chineseTitle ?? '',
        date: fresh.date ?? '',
        time: fresh.time ?? '',
        location: fresh.location ?? '',
        chinese_location: fresh.chinese_location ?? fresh.chineseLocation ?? '',
        description: fresh.description ?? '',
        chinese_description: fresh.chinese_description ?? fresh.chineseDescription ?? '',
        image: fresh.image ?? '',
        signup_link: fresh.signup_link ?? fresh.signupLink ?? '',
        status: fresh.status === 'Highlight' ? 'Past' : (fresh.status ?? 'Upcoming'),
        is_highlight: fresh.status === 'Highlight' ? true : Boolean(fresh.is_highlight),
        event_type: fresh.event_type ?? fresh.eventType ?? 'standard',
        heylo_embed: fresh.heylo_embed ?? fresh.heyloEmbed ?? '',
        wechat_qr_code: fresh.wechat_qr_code ?? fresh.wechatQrCode ?? '',
        is_recurring: Boolean(recurrence),
        recurrence_type: recurrence?.recurrence_type ?? 'weekly',
        days_of_week: recurrence?.days_of_week != null ? String(recurrence.days_of_week) : '',
        day_of_month: recurrence?.day_of_month != null ? String(recurrence.day_of_month) : '',
        week_of_month: recurrence?.week_of_month != null ? String(recurrence.week_of_month) : '',
        month_of_year: recurrence?.month_of_year != null ? String(recurrence.month_of_year) : '',
        recurrence_end_date: recurrence?.end_date ?? '',
      });
      setHadRecurrenceRule(Boolean(recurrence));
    })();
    return () => { cancelled = true; };
  }, [open, event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleChange = (field) => (e) => setField(field, e.target.value);

  const handleAutoFill = useAutoFillOnTab({
    setValue: setField,
    defaultValues: {
      name: 'New Event',
      chinese_name: '新活动',
      location: 'Central Park',
      chinese_location: '中央公园',
      description: 'Event description goes here.',
      chinese_description: '活动描述在此。',
      signup_link: 'https://newbeerunningclub.org/signup',
    },
  });
  const {
    handleKeyDown: handleTranslationKeyDown,
    handleBlur: handleTranslationBlur,
    isTranslating,
  } = useTranslationAutoFill({
    setValue: setField,
    getValue: (field) => formData[field],
    fieldPairs: [
      ['name', 'chinese_name'],
      ['location', 'chinese_location'],
      ['description', 'chinese_description'],
    ],
  });
  const handleFieldKeyDown = (e) => {
    handleAutoFill(e);
    handleTranslationKeyDown(e);
  };

  const nameMissing = touched && !formData.name;
  const dateMissing = touched && !formData.date;
  const signupLinkInvalid = !isValidUrl(formData.signup_link);
  const basicsValid = Boolean(formData.name && formData.date);

  const handleNext = () => {
    if (activeStep === 0 && !basicsValid) {
      setTouched(true);
      return;
    }
    setActiveStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const uploadFile = async (e, field, setBusy) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: 'Please select an image file / 请选择图片文件', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'Image must be less than 5MB / 图片必须小于5MB', severity: 'error' });
      return;
    }
    setBusy(true);
    try {
      // Upload immediately so a failure surfaces now, not at Save
      const { url } = await uploadImage(file, currentUser.uid);
      setField(field, url);
    } catch (err) {
      console.error('Error uploading image:', err);
      setSnackbar({ open: true, message: 'Failed to upload image / 图片上传失败', severity: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const syncRecurrenceRule = async (eventId) => {
    if (formData.is_recurring) {
      const rulePayload = {
        recurrence_type: formData.recurrence_type,
        days_of_week: formData.days_of_week || null,
        day_of_month: formData.day_of_month ? Number(formData.day_of_month) : null,
        week_of_month: formData.week_of_month ? Number(formData.week_of_month) : null,
        month_of_year: formData.month_of_year ? Number(formData.month_of_year) : null,
        end_date: formData.recurrence_end_date || null,
      };
      if (hadRecurrenceRule) {
        await updateEventRecurrence(eventId, rulePayload, currentUser.uid);
      } else {
        try {
          await createEventRecurrence(eventId, rulePayload, currentUser.uid);
        } catch (error) {
          // A rule already exists (stale local state) — update it instead
          if (error.status === 400) {
            await updateEventRecurrence(eventId, rulePayload, currentUser.uid);
          } else {
            throw error;
          }
        }
      }
    } else if (hadRecurrenceRule) {
      await deleteEventRecurrence(eventId, currentUser.uid);
    }
  };

  const handleSave = async () => {
    if (!basicsValid) {
      setTouched(true);
      setActiveStep(0);
      return;
    }
    if (signupLinkInvalid) {
      setActiveStep(1);
      return;
    }
    if (!currentUser?.uid) {
      setSnackbar({ open: true, message: 'You must be logged in to manage events / 您必须登录才能管理活动', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const {
        is_recurring, recurrence_type, days_of_week, day_of_month,
        week_of_month, month_of_year, recurrence_end_date,
        ...eventFields
      } = formData;
      // Empty strings become null so every surface persists the same shape
      const cleaned = Object.fromEntries(
        Object.entries(eventFields).map(([key, value]) => [key, value === '' ? null : value])
      );
      let saved;
      if (isEditing) {
        saved = await updateEvent(event.id, cleaned, currentUser.uid);
      } else {
        saved = await createEvent(cleaned, currentUser.uid);
      }
      await syncRecurrenceRule(isEditing ? event.id : saved.id);
      if (onSaved) await onSaved(saved ?? cleaned);
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      setSnackbar({ open: true, message: `Error: ${error.message || 'Failed to save event'}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Live preview mirrors what the Calendar page will render
  const previewEvent = {
    id: event?.id,
    name: formData.name || 'Event name',
    chinese_name: formData.chinese_name,
    date: formData.date,
    time: formData.time,
    location: formData.location,
    chinese_location: formData.chinese_location,
    description: formData.description,
    image: formData.image,
    signup_link: formData.signup_link,
    status: formData.status,
    event_type: formData.event_type,
    is_recurring: formData.is_recurring,
  };

  const translatingAdornment = isTranslating
    ? { endAdornment: <CircularProgress size={16} /> }
    : undefined;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="lg" fullWidth sx={sx}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {isEditing ? 'Edit Event / 编辑活动' : 'Add Event / 添加活动'}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Form column */}
          <Box sx={{ flex: 1.3, minWidth: 0 }}>
            <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
              {STEPS.map(label => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>

            {activeStep === 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Event Name / 活动名称"
                  value={formData.name}
                  onChange={handleChange('name')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="name"
                  required
                  error={nameMissing}
                  helperText={nameMissing ? 'Required / 必填' : ' '}
                />
                <TextField
                  label="Chinese Name / 中文名称"
                  value={formData.chinese_name}
                  onChange={handleChange('chinese_name')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="chinese_name"
                  helperText="Press Tab to auto-fill / 按 Tab 自动填充"
                  InputProps={translatingAdornment}
                />
                <TextField
                  type="date"
                  label="Date / 日期"
                  value={formData.date}
                  onChange={handleChange('date')}
                  required
                  error={dateMissing}
                  helperText={dateMissing ? 'Required / 必填' : ' '}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  type="time"
                  label="Time / 时间"
                  value={to24Hour(formData.time)}
                  onChange={(e) => setField('time', to12Hour(e.target.value))}
                  InputLabelProps={{ shrink: true }}
                  helperText={formData.time && !to24Hour(formData.time)
                    ? `Current value "${formData.time}" — pick a time to replace it`
                    : ' '}
                />
                <TextField
                  label="Location / 地点"
                  value={formData.location}
                  onChange={handleChange('location')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="location"
                />
                <TextField
                  label="Chinese Location / 中文地点"
                  value={formData.chinese_location}
                  onChange={handleChange('chinese_location')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="chinese_location"
                  InputProps={translatingAdornment}
                />
              </Box>
            )}

            {activeStep === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Description / 描述"
                  value={formData.description}
                  onChange={handleChange('description')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="description"
                  multiline
                  rows={3}
                />
                <TextField
                  label="Chinese Description / 中文描述"
                  value={formData.chinese_description}
                  onChange={handleChange('chinese_description')}
                  onKeyDown={handleFieldKeyDown}
                  onBlur={handleTranslationBlur}
                  name="chinese_description"
                  multiline
                  rows={3}
                  InputProps={translatingAdornment}
                />
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={imageInputRef}
                    onChange={(e) => uploadFile(e, 'image', setUploading)}
                  />
                  <Button
                    variant="outlined"
                    startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    sx={{ textTransform: 'none', borderRadius: '99px' }}
                  >
                    {formData.image ? 'Replace Image / 更换图片' : 'Upload Image / 上传图片'}
                  </Button>
                  {formData.image && (
                    <>
                      <Box component="img" src={formData.image} alt="Event" sx={{ height: 56, borderRadius: 1 }} />
                      <Button size="small" color="error" onClick={() => setField('image', '')} sx={{ textTransform: 'none' }}>
                        Remove / 移除
                      </Button>
                    </>
                  )}
                </Box>
                <TextField
                  label="Signup Link / 报名链接"
                  value={formData.signup_link}
                  onChange={handleChange('signup_link')}
                  onKeyDown={handleFieldKeyDown}
                  name="signup_link"
                  error={signupLinkInvalid}
                  helperText={signupLinkInvalid ? 'Must start with http:// or https:// / 链接格式错误' : ' '}
                />
                <TextField
                  select
                  label="Event Type / 活动类型"
                  value={formData.event_type}
                  onChange={handleChange('event_type')}
                >
                  <MenuItem value="standard">Standard / 标准</MenuItem>
                  <MenuItem value="heylo">Heylo</MenuItem>
                  <MenuItem value="race">Race / 比赛</MenuItem>
                </TextField>
                {formData.event_type === 'heylo' && (
                  <TextField
                    label="Heylo Embed / Heylo 嵌入代码"
                    value={formData.heylo_embed}
                    onChange={handleChange('heylo_embed')}
                    multiline
                    rows={2}
                  />
                )}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={qrInputRef}
                    onChange={(e) => uploadFile(e, 'wechat_qr_code', setUploadingQr)}
                  />
                  <Button
                    variant="outlined"
                    startIcon={uploadingQr ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                    onClick={() => qrInputRef.current?.click()}
                    disabled={uploadingQr}
                    sx={{ textTransform: 'none', borderRadius: '99px', borderColor: '#07C160', color: '#07C160' }}
                  >
                    {formData.wechat_qr_code ? 'Replace WeChat QR / 更换群二维码' : 'WeChat Group QR / 微信群二维码'}
                  </Button>
                  {formData.wechat_qr_code && (
                    <>
                      <Box component="img" src={formData.wechat_qr_code} alt="WeChat QR" sx={{ height: 56, borderRadius: 1 }} />
                      <Button size="small" color="error" onClick={() => setField('wechat_qr_code', '')} sx={{ textTransform: 'none' }}>
                        Remove / 移除
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            )}

            {activeStep === 2 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  select
                  label="Status / 状态"
                  value={formData.status}
                  onChange={handleChange('status')}
                >
                  <MenuItem value="Upcoming">Upcoming / 即将举行</MenuItem>
                  <MenuItem value="Past">Past / 已结束</MenuItem>
                  <MenuItem value="Cancelled">Cancelled / 已取消</MenuItem>
                </TextField>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_highlight}
                      onChange={(e) => setField('is_highlight', e.target.checked)}
                    />
                  }
                  label="Featured highlight / 精选回忆"
                />

                <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <RepeatIcon color="action" />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Recurring Event / 重复活动
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.is_recurring}
                        onChange={(e) => setField('is_recurring', e.target.checked)}
                      />
                    }
                    label="Enable recurrence / 启用重复"
                  />
                  {formData.is_recurring && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                      <TextField
                        select
                        label="Recurrence Type / 重复类型"
                        value={formData.recurrence_type}
                        onChange={handleChange('recurrence_type')}
                        fullWidth
                      >
                        <MenuItem value="weekly">Weekly / 每周</MenuItem>
                        <MenuItem value="biweekly">Biweekly / 每两周</MenuItem>
                        <MenuItem value="monthly">Monthly / 每月</MenuItem>
                        <MenuItem value="yearly">Yearly / 每年</MenuItem>
                      </TextField>
                      {(formData.recurrence_type === 'weekly' || formData.recurrence_type === 'biweekly') && (
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Days of Week / 每周哪几天
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
                              const days = formData.days_of_week ? formData.days_of_week.split(',').map(Number) : [];
                              const isSelected = days.includes(index);
                              return (
                                <Chip
                                  key={day}
                                  label={day}
                                  size="small"
                                  color={isSelected ? 'primary' : 'default'}
                                  onClick={() => {
                                    const newDays = isSelected
                                      ? days.filter(d => d !== index)
                                      : [...days, index].sort();
                                    setField('days_of_week', newDays.join(','));
                                  }}
                                  sx={{ cursor: 'pointer' }}
                                />
                              );
                            })}
                          </Box>
                        </Box>
                      )}
                      {formData.recurrence_type === 'monthly' && (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <TextField
                            type="number"
                            label="Day of Month / 每月几号"
                            value={formData.day_of_month}
                            onChange={handleChange('day_of_month')}
                            inputProps={{ min: 1, max: 31 }}
                            sx={{ flex: 1 }}
                            helperText="1-31 (or leave empty for week-based)"
                          />
                          <TextField
                            select
                            label="Week of Month / 每月第几周"
                            value={formData.week_of_month}
                            onChange={handleChange('week_of_month')}
                            sx={{ flex: 1 }}
                          >
                            <MenuItem value="">None</MenuItem>
                            <MenuItem value="1">1st / 第一周</MenuItem>
                            <MenuItem value="2">2nd / 第二周</MenuItem>
                            <MenuItem value="3">3rd / 第三周</MenuItem>
                            <MenuItem value="4">4th / 第四周</MenuItem>
                            <MenuItem value="5">Last / 最后一周</MenuItem>
                          </TextField>
                        </Box>
                      )}
                      {formData.recurrence_type === 'yearly' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <TextField
                            select
                            label="Month / 月份"
                            value={formData.month_of_year}
                            onChange={handleChange('month_of_year')}
                            fullWidth
                          >
                            {['January / 一月', 'February / 二月', 'March / 三月', 'April / 四月',
                              'May / 五月', 'June / 六月', 'July / 七月', 'August / 八月',
                              'September / 九月', 'October / 十月', 'November / 十一月', 'December / 十二月',
                            ].map((label, i) => (
                              <MenuItem key={label} value={String(i + 1)}>{label}</MenuItem>
                            ))}
                          </TextField>
                          <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                              select
                              label="Week / 第几周"
                              value={formData.week_of_month}
                              onChange={handleChange('week_of_month')}
                              sx={{ flex: 1 }}
                            >
                              <MenuItem value="1">1st / 第一</MenuItem>
                              <MenuItem value="2">2nd / 第二</MenuItem>
                              <MenuItem value="3">3rd / 第三</MenuItem>
                              <MenuItem value="4">4th / 第四</MenuItem>
                              <MenuItem value="5">Last / 最后</MenuItem>
                            </TextField>
                            <TextField
                              select
                              label="Day / 星期几"
                              value={formData.days_of_week}
                              onChange={handleChange('days_of_week')}
                              sx={{ flex: 1 }}
                            >
                              <MenuItem value="0">Sunday / 周日</MenuItem>
                              <MenuItem value="1">Monday / 周一</MenuItem>
                              <MenuItem value="2">Tuesday / 周二</MenuItem>
                              <MenuItem value="3">Wednesday / 周三</MenuItem>
                              <MenuItem value="4">Thursday / 周四</MenuItem>
                              <MenuItem value="5">Friday / 周五</MenuItem>
                              <MenuItem value="6">Saturday / 周六</MenuItem>
                            </TextField>
                          </Box>
                        </Box>
                      )}
                      <TextField
                        type="date"
                        label="End Date (optional) / 结束日期"
                        value={formData.recurrence_end_date}
                        onChange={handleChange('recurrence_end_date')}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        helperText="Leave empty for no end date / 留空表示无结束日期"
                      />
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {/* Live preview column */}
          <Box sx={{ flex: 1, minWidth: 0, display: { xs: 'none', md: 'block' } }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, letterSpacing: '0.06em', color: MUTED, display: 'block', mb: 1.5 }}
            >
              LIVE PREVIEW — WHAT MEMBERS WILL SEE 会员所见预览
            </Typography>
            <EventCard event={previewEvent} interactive={false} showEngagement={false} showDescription />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', color: MUTED }}>
          Cancel / 取消
        </Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && (
          <Button onClick={() => setActiveStep(s => s - 1)} disabled={saving} sx={{ textTransform: 'none' }}>
            Back / 上一步
          </Button>
        )}
        {activeStep < STEPS.length - 1 && (
          <Button
            variant="outlined"
            onClick={handleNext}
            sx={{ textTransform: 'none', borderRadius: '99px', borderColor: ORANGE, color: ORANGE }}
          >
            Continue / 下一步
          </Button>
        )}
        <Button
          variant="contained"
          disableElevation
          onClick={handleSave}
          disabled={saving || uploading || uploadingQr || !basicsValid}
          sx={{
            textTransform: 'none',
            borderRadius: '99px',
            fontWeight: 600,
            backgroundColor: ORANGE,
            '&:hover': { backgroundColor: ORANGE_DARK },
          }}
        >
          {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : (isEditing ? 'Save Event / 保存' : 'Create Event / 创建')}
        </Button>
      </DialogActions>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
