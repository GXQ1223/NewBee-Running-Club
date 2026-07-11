/**
 * AddRaceRecordDialog — member creates a race (name / date / distance /
 * official-results link), attaches their time + race photo, and submits the
 * record for NewBee committee review. Also used to edit & resubmit a
 * pending/rejected submission.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { Close as CloseIcon, CameraAlt as CameraIcon } from '@mui/icons-material';
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createRaceSubmission, updateRaceSubmission } from '../api/raceSubmissions';

const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const MUTED = '#757575';

const DISTANCES = ['Marathon', 'Half Marathon', '15K', '10K', '5K', '10M', '5M', '4M', '1M'];
const OTHER = '__other__';
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

const emptyForm = {
  race_name: '',
  race_date: '',
  race_distance: 'Marathon',
  custom_distance: '',
  finish_time: '',
  proof_url: '',
  photo_url: '',
};

const AddRaceRecordDialog = ({ open, onClose, onSubmitted, firebaseUid, editSubmission }) => {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && editSubmission) {
      const isKnown = DISTANCES.includes(editSubmission.race_distance);
      setForm({
        race_name: editSubmission.race_name || '',
        race_date: editSubmission.race_date || '',
        race_distance: isKnown ? editSubmission.race_distance : OTHER,
        custom_distance: isKnown ? '' : editSubmission.race_distance || '',
        finish_time: editSubmission.finish_time || '',
        proof_url: editSubmission.proof_url || '',
        photo_url: editSubmission.photo_url || '',
      });
    } else if (open) {
      setForm(emptyForm);
    }
    setError('');
  }, [open, editSubmission]);

  const setField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file. / 请选择图片文件。');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB. / 图片大小不能超过5MB。');
      return;
    }
    setUploadingPhoto(true);
    setError('');
    try {
      const storageRef = ref(storage, `race-photos/${firebaseUid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, photo_url: url }));
    } catch (err) {
      setError('Failed to upload photo. Please try again. / 照片上传失败，请重试。');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    const distance = form.race_distance === OTHER ? form.custom_distance.trim() : form.race_distance;
    if (!form.race_name.trim() || !form.race_date || !distance || !form.finish_time.trim()) {
      setError('Race name, date, distance and finish time are required. / 比赛名称、日期、距离和成绩为必填。');
      return;
    }
    if (!TIME_PATTERN.test(form.finish_time.trim())) {
      setError('Finish time must be H:MM:SS or MM:SS. / 成绩格式须为 H:MM:SS 或 MM:SS。');
      return;
    }
    if (form.race_date > new Date().toISOString().slice(0, 10)) {
      setError('Race date cannot be in the future. / 比赛日期不能是未来。');
      return;
    }

    setSaving(true);
    setError('');
    const payload = {
      race_name: form.race_name.trim(),
      race_date: form.race_date,
      race_distance: distance,
      finish_time: form.finish_time.trim(),
      proof_url: form.proof_url.trim() || null,
      photo_url: form.photo_url || null,
    };
    try {
      if (editSubmission) {
        await updateRaceSubmission(editSubmission.id, payload, firebaseUid);
      } else {
        await createRaceSubmission(payload, firebaseUid);
      }
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again. / 提交失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editSubmission ? 'Edit Race Record / 编辑比赛成绩' : 'Add Race Record / 添加比赛成绩'}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mb: 2 }}>
          Create the race and submit your result with proof. After committee review it is
          posted to the NewBee leaderboard. / 创建比赛并提交成绩与证明，委员会审核通过后将登上纽蜂排行榜。
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Race Name / 比赛名称"
              value={form.race_name}
              onChange={setField('race_name')}
              placeholder="e.g., Boston Marathon"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              type="date"
              label="Race Date / 比赛日期"
              value={form.race_date}
              onChange={setField('race_date')}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Distance / 距离</InputLabel>
              <Select
                value={form.race_distance}
                onChange={setField('race_distance')}
                label="Distance / 距离"
              >
                {DISTANCES.map((d) => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
                <MenuItem value={OTHER}>Other / 其他</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {form.race_distance === OTHER && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label="Custom Distance / 自定义距离"
                value={form.custom_distance}
                onChange={setField('custom_distance')}
                placeholder="e.g., 50K"
              />
            </Grid>
          )}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              label="Finish Time / 完赛成绩"
              value={form.finish_time}
              onChange={setField('finish_time')}
              placeholder="3:25:58"
              helperText="H:MM:SS or MM:SS"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Official Results Link / 官方成绩链接"
              value={form.proof_url}
              onChange={setField('proof_url')}
              placeholder="https://results.example.com/..."
              helperText="Link to the race's official results page (proof for review) / 官方成绩页链接（审核证明）"
            />
          </Grid>
          <Grid item xs={12}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              style={{ display: 'none' }}
              data-testid="race-photo-input"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={uploadingPhoto ? <CircularProgress size={14} /> : <CameraIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                sx={{
                  textTransform: 'none', fontWeight: 600, borderRadius: '99px',
                  borderColor: ORANGE, color: ORANGE,
                  '&:hover': { borderColor: ORANGE_DARK, backgroundColor: '#FFF6E8' },
                }}
              >
                {form.photo_url ? 'Change Race Photo 更换照片' : 'Race Photo 比赛照片 (optional)'}
              </Button>
              {form.photo_url && (
                <Box
                  component="img"
                  src={form.photo_url}
                  alt="Race"
                  sx={{ width: 72, height: 48, objectFit: 'cover', borderRadius: '8px', border: '1px solid #EEE7DC' }}
                />
              )}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '99px', color: MUTED }}
        >
          Cancel / 取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || uploadingPhoto}
          disableElevation
          sx={{
            backgroundColor: ORANGE, textTransform: 'none', fontWeight: 600,
            borderRadius: '99px', px: 3,
            '&:hover': { backgroundColor: ORANGE_DARK },
          }}
        >
          {saving ? <CircularProgress size={20} /> : 'Submit for Review / 提交审核'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddRaceRecordDialog;
