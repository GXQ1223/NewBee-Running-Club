import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Menu, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../../context';
import {
  getIncome, getFinanceCategories, classifyIncome, addManualIncome,
} from '../../api/finance';

// Design tokens (homepage design language + finance chip colors)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';
const GREEN = '#2e7d32';
const GREEN_BG = '#eaf5ea';
const TEAL = '#00796b';
const TEAL_BG = '#e0f2f1';
const BLUE = '#1a63d0';
const BLUE_BG = '#e8f0fe';
const PURPLE = '#7b3ff2';
const PURPLE_BG = '#f3e8ff';

export const INCOME_TYPES = [
  { key: 'donation', label: 'Donation 捐款', color: GREEN, bg: GREEN_BG },
  { key: 'event_revenue', label: 'Event Revenue 活动收入', color: TEAL, bg: TEAL_BG },
  { key: 'pass_through', label: 'Pass-through 代收', color: BLUE, bg: BLUE_BG },
];

const FILTERS = [
  { key: 'all', label: 'All 全部' },
  { key: 'unclassified', label: 'Unclassified 未分类' },
  { key: 'donation', label: 'Donation 捐款' },
  { key: 'event_revenue', label: 'Event Revenue 活动收入' },
  { key: 'pass_through', label: 'Pass-through 代收' },
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

const formatAmount = (amount) =>
  `$${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
};

// 'Zelle (Li Chen)' -> 'Zelle'; 'Manual entry' -> 'Manual entry'
export const methodFromSource = (source) =>
  (source || '').replace(/\s*\(.*$/, '').trim();

function CellChip({ label, color, bg, dashed, onClick, ariaLabel }) {
  return (
    <Chip
      size="small"
      label={label}
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        fontSize: '0.65625rem',
        fontWeight: 700,
        borderRadius: '99px',
        cursor: 'pointer',
        height: 22,
        backgroundColor: dashed ? 'white' : bg,
        color: dashed ? ORANGE : color,
        border: dashed ? `1.5px dashed ${ORANGE}` : '1px dashed transparent',
        '&:hover': { borderColor: ORANGE, backgroundColor: dashed ? ORANGE_BG : bg },
      }}
    />
  );
}

export default function IncomeGrid({ refreshKey = 0, onChanged }) {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [typeMenu, setTypeMenu] = useState(null); // { anchorEl, row }
  const [eventMenu, setEventMenu] = useState(null); // { anchorEl, row }
  const [bulkType, setBulkType] = useState('donation');
  const [bulkEvent, setBulkEvent] = useState('');
  const [applying, setApplying] = useState(false);

  // Manual income dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState(null);
  const [savingManual, setSavingManual] = useState(false);

  const fetchData = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      const [income, categories] = await Promise.all([
        getIncome(firebaseUid),
        getFinanceCategories(firebaseUid),
      ]);
      setRows(income);
      setEvents((categories.events || []).filter((e) => e.is_active !== false));
    } catch (err) {
      console.error('Error loading income:', err);
      setError('Failed to load income rows. / 加载收入记录失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const eventName = (code) =>
    events.find((e) => e.code === code)?.name || `#${code}`;

  const typeMeta = (key) => INCOME_TYPES.find((t) => t.key === key);

  const filteredRows = rows.filter((r) => {
    if (filter === 'unclassified') return !r.income_type;
    if (filter === 'all') return true;
    return r.income_type === filter;
  });

  const toggleSelected = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const allSelected = filteredRows.length > 0 &&
    filteredRows.every((r) => selected.includes(r.donation_id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : filteredRows.map((r) => r.donation_id));
  };

  const runClassify = async (payload) => {
    setError('');
    try {
      await classifyIncome(payload, firebaseUid);
      await fetchData();
      if (onChanged) onChanged();
    } catch (err) {
      console.error('Error classifying income:', err);
      setError('Failed to classify. / 分类失败。');
    }
  };

  const handlePickType = async (row, incomeType) => {
    setTypeMenu(null);
    await runClassify({ donation_ids: [row.donation_id], income_type: incomeType });
  };

  const handlePickEvent = async (row, eventCode) => {
    setEventMenu(null);
    await runClassify({
      donation_ids: [row.donation_id],
      income_type: row.income_type || 'donation',
      event_code: eventCode,
    });
  };

  const handleBulkApply = async () => {
    setApplying(true);
    const payload = { donation_ids: selected, income_type: bulkType };
    if (bulkEvent !== '') payload.event_code = bulkEvent;
    await runClassify(payload);
    setSelected([]);
    setApplying(false);
  };

  const openManual = () => {
    setManual({
      name: '', amount: '', donation_date: new Date().toISOString().split('T')[0],
      method: '', memo: '', income_type: 'donation', event_code: '',
    });
    setManualOpen(true);
  };

  const handleSaveManual = async () => {
    setSavingManual(true);
    setError('');
    try {
      const payload = {
        name: manual.name,
        amount: parseFloat(manual.amount),
        donation_date: manual.donation_date || undefined,
        method: manual.method || undefined,
        memo: manual.memo || undefined,
        income_type: manual.income_type,
      };
      if (manual.event_code !== '') payload.event_code = manual.event_code;
      await addManualIncome(payload, firebaseUid);
      setManualOpen(false);
      await fetchData();
      if (onChanged) onChanged();
    } catch (err) {
      console.error('Error adding manual income:', err);
      setError('Failed to add the manual row. / 手动记账失败。');
    } finally {
      setSavingManual(false);
    }
  };

  if (loading && rows.length === 0) {
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

      {/* Filter chips + manual entry */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            onClick={() => setFilter(f.key)}
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '99px',
              cursor: 'pointer',
              border: `1.5px solid ${filter === f.key ? ORANGE : LINE}`,
              backgroundColor: filter === f.key ? ORANGE : 'white',
              color: filter === f.key ? 'white' : MUTED,
              '&:hover': { backgroundColor: filter === f.key ? ORANGE_DARK : ORANGE_BG },
            }}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={openManual} sx={{
          textTransform: 'none', fontWeight: 700, fontSize: '0.75rem',
          border: `1.5px dashed ${ORANGE}`, color: ORANGE, borderRadius: '99px', px: 2,
        }}>
          ＋ Manual row 手动记一笔
        </Button>
      </Box>

      {/* Income grid */}
      <TableContainer component={Paper} elevation={0} sx={{
        border: `1px solid ${ORANGE}`,
        borderRadius: '0 10px 10px 10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
              <TableCell padding="checkbox" sx={{ borderBottom: `1px solid ${LINE}` }}>
                <Checkbox
                  size="small"
                  checked={allSelected}
                  onChange={toggleAll}
                  inputProps={{ 'aria-label': 'Select all rows 全选' }}
                  sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                />
              </TableCell>
              {['Date', 'From 来自', 'Amount', 'Method', 'Memo', 'Type 属性 ▾', 'Event 活动 ▾', 'Ack 致谢'].map((h) => (
                <TableCell key={h} sx={{
                  fontSize: '0.625rem', fontWeight: 700, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                  borderBottom: `1px solid ${LINE}`,
                  textAlign: h === 'Amount' ? 'right' : 'left',
                }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4, color: MUTED }}>
                  No income rows. / 暂无收入记录。
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => {
              const meta = typeMeta(row.income_type);
              const unclassified = !row.income_type;
              return (
                <TableRow key={row.donation_id} hover sx={{
                  backgroundColor: unclassified ? '#FFFDF8' : 'inherit',
                }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.includes(row.donation_id)}
                      onChange={() => toggleSelected(row.donation_id)}
                      inputProps={{ 'aria-label': `Select row ${row.donation_id}` }}
                      sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78125rem' }}>
                    {formatDate(row.donation_date)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: unclassified ? 700 : 500 }}>
                    {row.name}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: ORANGE, whiteSpace: 'nowrap', textAlign: 'right', fontSize: '0.78125rem' }}>
                    {formatAmount(row.amount)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', whiteSpace: 'nowrap' }}>
                    {methodFromSource(row.source)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: MUTED, maxWidth: 260 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: MUTED }} noWrap>
                      {row.message || ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {meta ? (
                      <CellChip
                        label={`${meta.label} ▾`}
                        color={meta.color}
                        bg={meta.bg}
                        ariaLabel={`Type for ${row.name}`}
                        onClick={(e) => setTypeMenu({ anchorEl: e.currentTarget, row })}
                      />
                    ) : (
                      <CellChip
                        label="＋ classify 分类"
                        dashed
                        ariaLabel={`Type for ${row.name}`}
                        onClick={(e) => setTypeMenu({ anchorEl: e.currentTarget, row })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.event_code ? (
                      <CellChip
                        label={`${eventName(row.event_code)} ▾`}
                        color={PURPLE}
                        bg={PURPLE_BG}
                        ariaLabel={`Event for ${row.name}`}
                        onClick={(e) => setEventMenu({ anchorEl: e.currentTarget, row })}
                      />
                    ) : (
                      <CellChip
                        label="＋ event"
                        dashed
                        ariaLabel={`Event for ${row.name}`}
                        onClick={(e) => setEventMenu({ anchorEl: e.currentTarget, row })}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {row.income_type && row.income_type !== 'donation' ? (
                      <Typography component="span" sx={{ fontSize: '0.75rem', color: MUTED }}>—</Typography>
                    ) : row.thank_you_sent_at ? (
                      <Typography component="span" sx={{ fontSize: '0.71875rem', color: GREEN, fontWeight: 700 }}>
                        ✓ {formatDate(row.thank_you_sent_at)}
                      </Typography>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bulk classify bar */}
      {selected.length > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap',
          backgroundColor: INK, color: 'white', borderRadius: '12px',
          px: 2, py: 1.25, mt: 1.5, fontSize: '0.78125rem',
        }}>
          <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>
            ☑ {selected.length} rows selected 已选 {selected.length} 行 →
          </Typography>
          <Typography sx={{ fontSize: '0.78125rem' }}>set Type 属性:</Typography>
          <Select
            size="small"
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value)}
            inputProps={{ 'aria-label': 'Bulk type 批量属性' }}
            sx={{ backgroundColor: 'white', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, '& .MuiSelect-select': { py: 0.5 } }}
          >
            {INCOME_TYPES.map((t) => (
              <MenuItem key={t.key} value={t.key} sx={{ fontSize: '0.8125rem' }}>{t.label}</MenuItem>
            ))}
          </Select>
          <Typography sx={{ fontSize: '0.78125rem' }}>set Event:</Typography>
          <Select
            size="small"
            value={bulkEvent}
            onChange={(e) => setBulkEvent(e.target.value)}
            displayEmpty
            inputProps={{ 'aria-label': 'Bulk event 批量活动' }}
            sx={{ backgroundColor: 'white', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, '& .MuiSelect-select': { py: 0.5 } }}
          >
            <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>— keep 保持 —</MenuItem>
            {events.map((ev) => (
              <MenuItem key={ev.code} value={ev.code} sx={{ fontSize: '0.8125rem' }}>{ev.name}</MenuItem>
            ))}
          </Select>
          <Button size="small" onClick={handleBulkApply} disabled={applying} sx={pillButtonSx}>
            {applying ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Apply 应用'}
          </Button>
          <Button size="small" onClick={() => setSelected([])} sx={{ textTransform: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.71875rem' }}>
            Clear 清除
          </Button>
        </Box>
      )}

      {/* Type chip menu */}
      <Menu
        anchorEl={typeMenu?.anchorEl}
        open={Boolean(typeMenu)}
        onClose={() => setTypeMenu(null)}
      >
        {INCOME_TYPES.map((t) => (
          <MenuItem
            key={t.key}
            onClick={() => handlePickType(typeMenu.row, t.key)}
            sx={{ fontSize: '0.8125rem', fontWeight: 600, color: t.color }}
          >
            {t.label}
          </MenuItem>
        ))}
      </Menu>

      {/* Event chip menu */}
      <Menu
        anchorEl={eventMenu?.anchorEl}
        open={Boolean(eventMenu)}
        onClose={() => setEventMenu(null)}
      >
        {events.map((ev) => (
          <MenuItem
            key={ev.code}
            onClick={() => handlePickEvent(eventMenu.row, ev.code)}
            sx={{ fontSize: '0.8125rem', fontWeight: 600, color: PURPLE }}
          >
            {ev.name}
          </MenuItem>
        ))}
      </Menu>

      {/* Manual income dialog */}
      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>＋ Manual row 手动记一笔</DialogTitle>
        <DialogContent>
          {manual && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  label="From 来自"
                  size="small"
                  fullWidth
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                />
                <TextField
                  label="Amount 金额 $"
                  size="small"
                  type="number"
                  sx={{ width: 180 }}
                  value={manual.amount}
                  onChange={(e) => setManual({ ...manual, amount: e.target.value })}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  label="Date 日期"
                  type="date"
                  size="small"
                  fullWidth
                  value={manual.donation_date}
                  onChange={(e) => setManual({ ...manual, donation_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Method 方式"
                  size="small"
                  fullWidth
                  placeholder="Cash / Check ..."
                  value={manual.method}
                  onChange={(e) => setManual({ ...manual, method: e.target.value })}
                />
              </Box>
              <TextField
                label="Memo 备注"
                size="small"
                fullWidth
                value={manual.memo}
                onChange={(e) => setManual({ ...manual, memo: e.target.value })}
              />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Select
                  size="small"
                  fullWidth
                  value={manual.income_type}
                  onChange={(e) => setManual({ ...manual, income_type: e.target.value })}
                  inputProps={{ 'aria-label': 'Type 属性' }}
                >
                  {INCOME_TYPES.map((t) => (
                    <MenuItem key={t.key} value={t.key} sx={{ fontSize: '0.8125rem' }}>{t.label}</MenuItem>
                  ))}
                </Select>
                <Select
                  size="small"
                  fullWidth
                  value={manual.event_code}
                  onChange={(e) => setManual({ ...manual, event_code: e.target.value })}
                  displayEmpty
                  inputProps={{ 'aria-label': 'Event 活动' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>General 常规</MenuItem>
                  {events.map((ev) => (
                    <MenuItem key={ev.code} value={ev.code} sx={{ fontSize: '0.8125rem' }}>{ev.name}</MenuItem>
                  ))}
                </Select>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setManualOpen(false)} disabled={savingManual}>Cancel 取消</Button>
          <Button
            onClick={handleSaveManual}
            disabled={savingManual || !manual?.name || !(parseFloat(manual?.amount) > 0)}
            sx={pillButtonSx}
          >
            {savingManual ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Save 保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
