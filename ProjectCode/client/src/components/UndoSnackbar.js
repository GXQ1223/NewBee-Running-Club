import React, { useEffect, useState } from 'react';
import { Snackbar, Button, IconButton, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';

/**
 * UndoSnackbar - Shows a notification with undo button after merge operations
 * Auto-dismisses after 5 seconds, but allows manual undo before that
 */
const UndoSnackbar = ({
  open,
  message,
  onClose,
  onUndo,
  autoHideDuration = 5000,
}) => {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    if (!open) {
      setTimeLeft(5);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
    }
    onClose();
  };

  const action = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button
        size="small"
        onClick={handleUndo}
        startIcon={<UndoIcon />}
        sx={{
          color: 'white',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
          },
          textTransform: 'none',
          fontWeight: 600,
        }}
      >
        Undo ({timeLeft}s)
      </Button>
      <IconButton
        size="small"
        aria-label="close"
        color="inherit"
        onClick={onClose}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={(event, reason) => {
        if (reason === 'clickaway') return;
        onClose();
      }}
      message={
        <Typography sx={{ fontWeight: 500 }}>
          {message}
        </Typography>
      }
      action={action}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        '& .MuiSnackbarContent-root': {
          backgroundColor: '#333',
          borderRadius: '12px',
          padding: '8px 16px',
        },
      }}
    />
  );
};

export default UndoSnackbar;
