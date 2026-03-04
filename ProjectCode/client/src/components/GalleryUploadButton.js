import React, { useState, useRef, useEffect } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  CircularProgress,
  IconButton,
  Fab,
  useTheme,
  useMediaQuery,
  LinearProgress,
  Grid,
  TextField,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseIcon from '@mui/icons-material/Close';
import { uploadGalleryImage, compressImage, compressImageForUpload, getPhotographerNames } from '../api/gallery';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context';

/**
 * GalleryUploadButton - Upload interface for authenticated users to add photos to gallery
 * Supports multiple image uploads
 */
const GalleryUploadButton = ({
  eventId,
  onUploadSuccess,
  variant = 'fab', // 'fab' | 'button'
}) => {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [photographerCredit, setPhotographerCredit] = useState('');
  const [photographerOptions, setPhotographerOptions] = useState([]);
  const fileInputRef = useRef(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentUser } = useAuth();
  const { memberData } = useAdmin();

  // Fetch known photographer names for autocomplete
  useEffect(() => {
    getPhotographerNames()
      .then(names => setPhotographerOptions(names || []))
      .catch(() => {});
  }, []);

  const handleOpen = () => {
    if (!currentUser) {
      setError('Please log in to upload photos / 请登录后上传照片');
      return;
    }
    // Default photographer credit to current user's name
    const defaultName = memberData?.display_name || memberData?.username || currentUser?.displayName || '';
    setPhotographerCredit(defaultName);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedFiles([]);
    setPreviews([]);
    setError(null);
    setPhotographerCredit('');
    setUploadProgress({ current: 0, total: 0 });
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const validFiles = [];
    const newPreviews = [];
    let hasError = false;

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Some files are not images and were skipped / 部分文件不是图片，已跳过');
        hasError = true;
        continue;
      }

      // Validate file size (max 50MB per file - will be compressed before upload)
      if (file.size > 50 * 1024 * 1024) {
        setError('Some images exceed 50MB and were skipped / 部分图片超过50MB，已跳过');
        hasError = true;
        continue;
      }

      validFiles.push(file);

      // Create preview (compressed for display only)
      try {
        const previewUrl = await compressImage(file, 400, 0.7);
        newPreviews.push({ file, preview: previewUrl });
      } catch (err) {
        // Fallback to original
        const reader = new FileReader();
        const previewUrl = await new Promise((resolve) => {
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        });
        newPreviews.push({ file, preview: previewUrl });
      }
    }

    if (!hasError) {
      setError(null);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...newPreviews]);

    // Reset file input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length || !eventId) return;

    setUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    const uploadedImages = [];
    const failedUploads = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress({ current: i + 1, total: selectedFiles.length });

      try {
        // Compress image before upload (resize + JPEG compression)
        const compressedFile = await compressImageForUpload(file);
        const result = await uploadGalleryImage(eventId, compressedFile, null, null, photographerCredit || null, currentUser?.uid);
        uploadedImages.push(result);

        // Notify parent of each successful upload
        if (onUploadSuccess) {
          onUploadSuccess(result);
        }
      } catch (err) {
        console.error('Upload failed for file:', file.name, err);
        failedUploads.push(file.name);
      }
    }

    if (failedUploads.length > 0) {
      setError(`Failed to upload: ${failedUploads.join(', ')}`);
      // Remove successfully uploaded files from selection
      const failedFiles = selectedFiles.filter((f) => failedUploads.includes(f.name));
      const failedPreviews = previews.filter((p) => failedUploads.includes(p.file.name));
      setSelectedFiles(failedFiles);
      setPreviews(failedPreviews);
      setUploading(false);
    } else {
      handleClose();
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const renderTrigger = () => {
    if (variant === 'fab') {
      return (
        <Fab
          color="primary"
          onClick={handleOpen}
          sx={{
            position: 'fixed',
            bottom: isMobile ? 80 : 24,
            right: 24,
          }}
        >
          <AddPhotoAlternateIcon />
        </Fab>
      );
    }

    return (
      <Button
        variant="outlined"
        startIcon={<AddPhotoAlternateIcon />}
        onClick={handleOpen}
      >
        Upload Photos / 上传照片
      </Button>
    );
  };

  return (
    <>
      {renderTrigger()}

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">Upload Photos</Typography>
            <Typography variant="body2" color="text.secondary">
              上传照片
            </Typography>
          </Box>
          <IconButton onClick={handleClose} disabled={uploading}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {/* File input (hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Upload progress */}
          {uploading && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Uploading {uploadProgress.current} of {uploadProgress.total}...
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(uploadProgress.current / uploadProgress.total) * 100}
              />
            </Box>
          )}

          {/* Image previews grid */}
          {previews.length > 0 ? (
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={1}>
                {previews.map((item, index) => (
                  <Grid item xs={4} sm={3} md={2} key={index}>
                    <Box
                      sx={{
                        position: 'relative',
                        paddingTop: '100%',
                        borderRadius: 1,
                        overflow: 'hidden',
                        bgcolor: 'grey.100',
                      }}
                    >
                      <Box
                        component="img"
                        src={item.preview}
                        alt={`Preview ${index + 1}`}
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      {!uploading && (
                        <IconButton
                          size="small"
                          onClick={() => removeFile(index)}
                          sx={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            bgcolor: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            padding: 0.5,
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Grid>
                ))}

                {/* Add more button */}
                {!uploading && (
                  <Grid item xs={4} sm={3} md={2}>
                    <Box
                      onClick={triggerFileInput}
                      sx={{
                        position: 'relative',
                        paddingTop: '100%',
                        borderRadius: 1,
                        border: '2px dashed',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AddPhotoAlternateIcon sx={{ color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Add more
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
              </Grid>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {selectedFiles.length} photo{selectedFiles.length !== 1 ? 's' : ''} selected
                {' / '}
                已选择 {selectedFiles.length} 张照片
              </Typography>
            </Box>
          ) : (
            <Box
              onClick={triggerFileInput}
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                mb: 2,
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            >
              <AddPhotoAlternateIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1">
                Click to select images
              </Typography>
              <Typography variant="body2" color="text.secondary">
                点击选择图片
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                JPEG/PNG/GIF • Select multiple • Images auto-compressed
              </Typography>
            </Box>
          )}

          {/* Photographer credit */}
          {selectedFiles.length > 0 && (
            <Autocomplete
              freeSolo
              options={photographerOptions}
              value={photographerCredit}
              onInputChange={(_, value) => setPhotographerCredit(value)}
              disabled={uploading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Photographer 摄影师"
                  placeholder="Search or enter name..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <CameraAltIcon sx={{ color: 'text.secondary', mr: 0.5, fontSize: 18 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              sx={{ mt: 1, mb: 1 }}
            />
          )}

          {/* Error message */}
          {error && (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {error}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={uploading}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFiles.length || uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : null}
          >
            {uploading
              ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
              : `Upload ${selectedFiles.length || ''} Photo${selectedFiles.length !== 1 ? 's' : ''} / 上传`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default GalleryUploadButton;
