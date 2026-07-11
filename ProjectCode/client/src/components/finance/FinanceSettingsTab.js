import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, MenuItem, Paper,
  Select, Switch, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../../context';
import {
  getFinanceSettings, updateFinanceSettings, getFinanceCategories,
  createFinanceCategory, updateFinanceCategory,
} from '../../api/finance';

// Design tokens (homepage design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const LINE = '#EEE7DC';
const MUTED = '#757575';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_KINDS = [
  { kind: 'event', listKey: 'events', title: 'Events 活动' },
  { kind: 'income_type', listKey: 'income_types', title: 'Income types 收入属性' },
  { kind: 'expense', listKey: 'expenses', title: 'Expense categories 支出类别' },
];

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

export default function FinanceSettingsTab() {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgStartDraft, setOrgStartDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [newNames, setNewNames] = useState({}); // kind -> name

  const fetchData = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      const [settingsData, categoriesData] = await Promise.all([
        getFinanceSettings(firebaseUid),
        getFinanceCategories(firebaseUid),
      ]);
      setSettings(settingsData);
      setOrgStartDraft(settingsData.org_start || '');
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading finance settings:', err);
      setError('Failed to load settings. / 加载设置失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveSettings = async (patch) => {
    setError('');
    try {
      await updateFinanceSettings(patch, firebaseUid);
      setSettings((prev) => ({ ...prev, ...patch }));
    } catch (err) {
      console.error('Error saving finance settings:', err);
      setError('Failed to save settings. / 保存设置失败。');
    }
  };

  const refreshCategories = async () => {
    setCategories(await getFinanceCategories(firebaseUid));
  };

  const handleAddCategory = async (kind) => {
    const name = (newNames[kind] || '').trim();
    if (!name) return;
    setError('');
    try {
      await createFinanceCategory({ kind, name }, firebaseUid);
      setNewNames((prev) => ({ ...prev, [kind]: '' }));
      await refreshCategories();
    } catch (err) {
      console.error('Error adding category:', err);
      setError('Failed to add the category. / 添加类别失败。');
    }
  };

  const handleRename = async () => {
    if (!editing || !editing.name.trim()) return;
    setError('');
    try {
      await updateFinanceCategory(editing.id, { name: editing.name.trim() }, firebaseUid);
      setEditing(null);
      await refreshCategories();
    } catch (err) {
      console.error('Error renaming category:', err);
      setError('Failed to rename the category. / 重命名失败。');
    }
  };

  if (loading && !settings) {
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

      {/* Acknowledgment + 509(a) parameters */}
      <Paper elevation={0} sx={{ border: `1px solid ${LINE}`, borderRadius: '12px', p: 2.5, mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(settings?.auto_ack_enabled)}
              onChange={(e) => saveSettings({ auto_ack_enabled: e.target.checked })}
              inputProps={{ 'aria-label': 'Auto-send acknowledgments weekly 每周自动致谢' }}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: ORANGE },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: ORANGE },
              }}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.84375rem', fontWeight: 600 }}>
              Auto-send acknowledgments weekly 每周自动致谢
            </Typography>
          }
        />
        <Typography sx={{ fontSize: '0.71875rem', color: MUTED, mb: 2 }}>
          Donations with a directory email get a thank-you automatically each week. / 通讯录中有邮箱的捐款每周自动发送致谢。
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Org start 组织成立日 (990)"
            type="date"
            size="small"
            value={orgStartDraft}
            onChange={(e) => setOrgStartDraft(e.target.value)}
            onBlur={() => {
              if (orgStartDraft && orgStartDraft !== settings?.org_start) {
                saveSettings({ org_start: orgStartDraft });
              }
            }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ 'aria-label': 'Org start 组织成立日' }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>
              Fiscal year end 财年截止月:
            </Typography>
            <Select
              size="small"
              value={settings?.fye_month || 12}
              onChange={(e) => saveSettings({ fye_month: e.target.value })}
              inputProps={{ 'aria-label': 'Fiscal year end month 财年截止月' }}
              sx={{ borderRadius: '8px', fontSize: '0.78125rem' }}
            >
              {MONTHS.map((m, i) => (
                <MenuItem key={m} value={i + 1} sx={{ fontSize: '0.8125rem' }}>{m}</MenuItem>
              ))}
            </Select>
          </Box>
          <Typography sx={{ fontSize: '0.71875rem', color: '#9a9a9a' }}>
            Both feed the 509(a) public support tests. / 两者用于 509(a) 公共支持测试。
          </Typography>
        </Box>
      </Paper>

      {/* Category management */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {CATEGORY_KINDS.map(({ kind, listKey, title }) => (
          <Paper key={kind} elevation={0} sx={{
            flex: 1, minWidth: 260, border: `1px solid ${LINE}`, borderRadius: '12px', p: 2,
          }}>
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
              {title}
            </Typography>
            {(categories?.[listKey] || []).map((cat) => (
              <Box key={cat.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${LINE}` }}>
                <Chip size="small" label={cat.code} sx={{
                  fontSize: '0.625rem', fontWeight: 700, borderRadius: '99px', height: 18,
                  backgroundColor: '#f1f1f1', color: MUTED,
                }} />
                {editing?.id === cat.id ? (
                  <>
                    <TextField
                      size="small"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      inputProps={{ 'aria-label': `Rename ${cat.name}` }}
                      sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontSize: '0.78125rem', py: 0.5 } }}
                    />
                    <Button size="small" onClick={handleRename} sx={{ ...pillButtonSx, fontSize: '0.65625rem', py: 0.25 }}>
                      Save 保存
                    </Button>
                    <Button size="small" onClick={() => setEditing(null)} sx={{ textTransform: 'none', fontSize: '0.65625rem', color: MUTED, minWidth: 0 }}>
                      ✕
                    </Button>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600, flexGrow: 1, color: cat.is_active === false ? '#b5b5b5' : 'inherit' }}>
                      {cat.name}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setEditing({ id: cat.id, name: cat.name })}
                      sx={{ textTransform: 'none', fontSize: '0.65625rem', fontWeight: 700, color: ORANGE, minWidth: 0 }}
                    >
                      ✎ Rename 重命名
                    </Button>
                  </>
                )}
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
              <TextField
                size="small"
                placeholder="New name 新名称"
                value={newNames[kind] || ''}
                onChange={(e) => setNewNames((prev) => ({ ...prev, [kind]: e.target.value }))}
                inputProps={{ 'aria-label': `New ${title}` }}
                sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontSize: '0.78125rem', py: 0.5 } }}
              />
              <Button
                size="small"
                onClick={() => handleAddCategory(kind)}
                disabled={!(newNames[kind] || '').trim()}
                sx={{ ...pillButtonSx, fontSize: '0.65625rem', py: 0.25 }}
              >
                ＋ Add 添加
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
