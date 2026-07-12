import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, IconButton, Paper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuth } from '../../context';
import { getDirectory, upsertDirectoryEntry, deleteDirectoryEntry } from '../../api/finance';

// Design tokens (homepage design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const LINE = '#EEE7DC';
const MUTED = '#757575';
const RED = '#c62828';

const pillButtonSx = {
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: '99px',
  px: 2,
  boxShadow: 'none',
  color: 'white',
  backgroundColor: ORANGE,
  '&:hover': { backgroundColor: ORANGE_DARK, boxShadow: 'none' },
};

export default function DirectoryTab() {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({}); // id -> { email, is_insider }
  const [savingId, setSavingId] = useState(null);
  const [newEntry, setNewEntry] = useState({ name: '', email: '', is_insider: false });
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      setEntries(await getDirectory(firebaseUid));
      setDrafts({});
    } catch (err) {
      console.error('Error loading directory:', err);
      setError('Failed to load the directory. / 加载通讯录失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const draftFor = (entry) => drafts[entry.id] || { email: entry.email, is_insider: Boolean(entry.is_insider) };

  const setDraft = (entry, patch) => {
    setDrafts((prev) => ({ ...prev, [entry.id]: { ...draftFor(entry), ...patch } }));
  };

  const isDirty = (entry) => {
    const d = drafts[entry.id];
    return Boolean(d) && (d.email !== entry.email || d.is_insider !== Boolean(entry.is_insider));
  };

  const handleSave = async (entry) => {
    const d = draftFor(entry);
    setSavingId(entry.id);
    setError('');
    try {
      await upsertDirectoryEntry({ name: entry.name, email: d.email, is_insider: d.is_insider }, firebaseUid);
      await fetchData();
    } catch (err) {
      console.error('Error saving directory entry:', err);
      setError('Failed to save the entry. / 保存通讯录失败。');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (entry) => {
    setError('');
    try {
      await deleteDirectoryEntry(entry.id, firebaseUid);
      await fetchData();
    } catch (err) {
      console.error('Error deleting directory entry:', err);
      setError('Failed to delete the entry. / 删除失败。');
    }
  };

  const handleAdd = async () => {
    setAdding(true);
    setError('');
    try {
      await upsertDirectoryEntry(newEntry, firebaseUid);
      setNewEntry({ name: '', email: '', is_insider: false });
      await fetchData();
    } catch (err) {
      console.error('Error adding directory entry:', err);
      setError('Failed to add the entry. / 添加失败。');
    } finally {
      setAdding(false);
    }
  };

  if (loading && entries.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Typography sx={{ fontSize: '0.75rem', color: MUTED, mb: 1.5 }}>
        Payer name → email, used to send acknowledgments automatically. Mark committee members and their
        families as insiders for the 509(a) tests. / 付款人姓名对应邮箱，用于自动发送致谢；请将委员会成员及家属标记为内部人，用于 509(a) 测试。
      </Typography>

      <TableContainer component={Paper} elevation={0} sx={{
        border: `1px solid ${ORANGE}`,
        borderRadius: '0 10px 10px 10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
              {['Name 姓名', 'Email 邮箱', 'Insider 内部人', ''].map((h, i) => (
                <TableCell key={`${h}-${i}`} sx={{
                  fontSize: '0.625rem', fontWeight: 700, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                  borderBottom: `1px solid ${LINE}`,
                }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: MUTED }}>
                  No entries yet. / 暂无通讯录条目。
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => {
              const d = draftFor(entry);
              return (
                <TableRow key={entry.id} hover>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={d.email}
                      onChange={(e) => setDraft(entry, { email: e.target.value })}
                      inputProps={{ 'aria-label': `Email for ${entry.name}` }}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.78125rem', py: 0.5 } }}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      size="small"
                      checked={d.is_insider}
                      onChange={(e) => setDraft(entry, { is_insider: e.target.checked })}
                      inputProps={{ 'aria-label': `Insider for ${entry.name}` }}
                      sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {isDirty(entry) && (
                      <Button
                        size="small"
                        onClick={() => handleSave(entry)}
                        disabled={savingId === entry.id}
                        sx={{ ...pillButtonSx, fontSize: '0.6875rem', py: 0.25, mr: 0.5 }}
                      >
                        {savingId === entry.id
                          ? <CircularProgress size={12} sx={{ color: 'white' }} />
                          : 'Save 保存'}
                      </Button>
                    )}
                    <IconButton
                      size="small"
                      aria-label={`Delete ${entry.name}`}
                      onClick={() => handleDelete(entry)}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 17, color: MUTED, '&:hover': { color: RED } }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add row form */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
        <TextField
          label="Name 姓名"
          size="small"
          value={newEntry.name}
          onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
        />
        <TextField
          label="Email 邮箱"
          size="small"
          type="email"
          value={newEntry.email}
          onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })}
        />
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Checkbox
            size="small"
            checked={newEntry.is_insider}
            onChange={(e) => setNewEntry({ ...newEntry, is_insider: e.target.checked })}
            inputProps={{ 'aria-label': 'New entry insider 内部人' }}
            sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
          />
          <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>Insider 内部人</Typography>
        </Box>
        <Button
          size="small"
          onClick={handleAdd}
          disabled={adding || !newEntry.name || !newEntry.email.includes('@')}
          sx={pillButtonSx}
        >
          {adding ? <CircularProgress size={14} sx={{ color: 'white' }} /> : '＋ Add 添加'}
        </Button>
      </Box>
    </Box>
  );
}
