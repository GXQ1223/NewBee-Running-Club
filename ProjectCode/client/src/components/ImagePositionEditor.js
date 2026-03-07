import { useState, useRef, useCallback } from 'react';
import { Box, IconButton, Tooltip, CircularProgress } from '@mui/material';
import CropIcon from '@mui/icons-material/Crop';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { updateEvent } from '../api';
import { useAuth } from '../context/AuthContext';

export default function ImagePositionEditor({ eventId, imageUrl, currentPosition, onPositionSaved, sx }) {
  const { currentUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState(currentPosition || 'center center');
  const [dragStart, setDragStart] = useState(null);
  const [positionAtDragStart, setPositionAtDragStart] = useState(null);
  const dragRef = useRef(null);

  const parsePosition = (pos) => {
    const parts = (pos || 'center center').split(' ');
    const x = parseFloat(parts[0]) || 50;
    const y = parseFloat(parts[1]) || 50;
    return { x, y };
  };

  const handlePointerDown = useCallback((e) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = dragRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX, y: e.clientY, rect });
    setPositionAtDragStart(parsePosition(position));
    dragRef.current.setPointerCapture(e.pointerId);
  }, [editing, position]);

  const handlePointerMove = useCallback((e) => {
    if (!dragStart || !editing) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const pctX = Math.max(0, Math.min(100, positionAtDragStart.x - (dx / dragStart.rect.width) * 100));
    const pctY = Math.max(0, Math.min(100, positionAtDragStart.y - (dy / dragStart.rect.height) * 100));
    setPosition(`${pctX.toFixed(1)}% ${pctY.toFixed(1)}%`);
  }, [dragStart, editing, positionAtDragStart]);

  const handlePointerUp = useCallback((e) => {
    if (!dragStart) return;
    e.preventDefault();
    e.stopPropagation();
    setDragStart(null);
    setPositionAtDragStart(null);
  }, [dragStart]);

  const handleSave = async (e) => {
    e.stopPropagation();
    if (!currentUser?.uid) return;
    setSaving(true);
    try {
      await updateEvent(eventId, { image_position: position }, currentUser.uid);
      setEditing(false);
      if (onPositionSaved) onPositionSaved(position);
    } catch (error) {
      console.error('Error saving image position:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setPosition(currentPosition || 'center center');
    setEditing(false);
  };

  const handleStartEdit = (e) => {
    e.stopPropagation();
    setEditing(true);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        ...sx,
      }}
      onClick={editing ? (e) => e.stopPropagation() : undefined}
    >
      <Box
        component="img"
        src={imageUrl}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: position,
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {/* Drag overlay - only this area captures pointer for dragging */}
      {editing && (
        <Box
          ref={dragRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 40,
            cursor: 'grab',
            border: '3px dashed #FFB84D',
            borderBottom: 'none',
          }}
        />
      )}
      {/* Edit button */}
      {!editing && (
        <Tooltip title="Adjust image position / 调整图片位置">
          <IconButton
            size="small"
            onClick={handleStartEdit}
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              '&:hover': { backgroundColor: 'white' },
              zIndex: 10,
            }}
          >
            <CropIcon fontSize="small" sx={{ color: '#FFB84D' }} />
          </IconButton>
        </Tooltip>
      )}
      {/* Save/Cancel buttons */}
      {editing && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            display: 'flex',
            gap: 0.5,
            zIndex: 20,
          }}
        >
          <Tooltip title="Save / 保存">
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={saving}
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                '&:hover': { backgroundColor: 'white' },
              }}
            >
              {saving ? <CircularProgress size={18} /> : <CheckIcon fontSize="small" sx={{ color: '#4caf50' }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Cancel / 取消">
            <IconButton
              size="small"
              onClick={handleCancel}
              disabled={saving}
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                '&:hover': { backgroundColor: 'white' },
              }}
            >
              <CloseIcon fontSize="small" sx={{ color: '#f44336' }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
