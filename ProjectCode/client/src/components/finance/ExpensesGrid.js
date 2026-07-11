import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Menu, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuth } from '../../context';
import {
  getExpenses, getFinanceCategories, classifyExpenses, deleteExpense,
} from '../../api/finance';

// Design tokens (homepage design language + finance chip colors)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';
const TEAL = '#00796b';
const TEAL_BG = '#e0f2f1';
const PURPLE = '#7b3ff2';
const PURPLE_BG = '#f3e8ff';
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

export default function ExpensesGrid({ refreshKey = 0, onChanged }) {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [eventMenu, setEventMenu] = useState(null); // { anchorEl, row }
  const [categoryMenu, setCategoryMenu] = useState(null); // { anchorEl, row }
  const [bulkEvent, setBulkEvent] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [applying, setApplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      const [expenses, categories] = await Promise.all([
        getExpenses(firebaseUid),
        getFinanceCategories(firebaseUid),
      ]);
      setRows(expenses);
      setEvents((categories.events || []).filter((c) => c.is_active !== false));
      setExpenseCategories((categories.expenses || []).filter((c) => c.is_active !== false));
    } catch (err) {
      console.error('Error loading expenses:', err);
      setError('Failed to load expenses. / 加载支出记录失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const eventName = (code) => events.find((e) => e.code === code)?.name || `#${code}`;
  const categoryName = (code) =>
    expenseCategories.find((c) => c.code === code)?.name || `#${code}`;

  const toggleSelected = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () => {
    setSelected(allSelected ? [] : rows.map((r) => r.id));
  };

  const runClassify = async (payload) => {
    setError('');
    try {
      await classifyExpenses(payload, firebaseUid);
      await fetchData();
      if (onChanged) onChanged();
    } catch (err) {
      console.error('Error classifying expenses:', err);
      setError('Failed to classify. / 分类失败。');
    }
  };

  const handlePickEvent = async (row, eventCode) => {
    setEventMenu(null);
    await runClassify({ expense_ids: [row.id], event_code: eventCode });
  };

  const handlePickCategory = async (row, categoryCode) => {
    setCategoryMenu(null);
    await runClassify({ expense_ids: [row.id], expense_category_code: categoryCode });
  };

  const handleBulkApply = async () => {
    setApplying(true);
    const payload = { expense_ids: selected };
    if (bulkEvent !== '') payload.event_code = bulkEvent;
    if (bulkCategory !== '') payload.expense_category_code = bulkCategory;
    await runClassify(payload);
    setSelected([]);
    setApplying(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await deleteExpense(deleteTarget.id, firebaseUid);
      setDeleteTarget(null);
      await fetchData();
      if (onChanged) onChanged();
    } catch (err) {
      console.error('Error deleting expense:', err);
      setError('Failed to delete the expense. / 删除支出失败。');
    } finally {
      setDeleting(false);
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

      {/* Import hint banner */}
      <Box sx={{
        backgroundColor: ORANGE_BG, border: `1px dashed ${ORANGE}`, borderRadius: '10px',
        px: 2, py: 1, mb: 1.5,
      }}>
        <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
          ⬆ Use <b>Import Chase CSV 导入账单</b> in the toolbar above — duplicates are skipped automatically.
          用上方工具栏导入 Chase 账单，重复记录自动跳过。
        </Typography>
      </Box>

      {/* Expenses grid */}
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
                  inputProps={{ 'aria-label': 'Select all expenses 全选' }}
                  sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                />
              </TableCell>
              {['Date', 'Vendor 商家', 'Amount', 'Method', 'Bank description 银行描述', 'Event 活动 ▾', 'Category 类别 ▾', ''].map((h, i) => (
                <TableCell key={`${h}-${i}`} sx={{
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: MUTED }}>
                  No expenses yet — import a Chase CSV to get started. / 暂无支出，请先导入账单。
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const unclassified = !row.event_code && !row.expense_category_code;
              return (
                <TableRow key={row.id} hover sx={{ backgroundColor: unclassified ? '#FFFDF8' : 'inherit' }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      inputProps={{ 'aria-label': `Select expense ${row.id}` }}
                      sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78125rem' }}>
                    {formatDate(row.expense_date)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 600 }}>
                    {row.vendor}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: RED, whiteSpace: 'nowrap', textAlign: 'right', fontSize: '0.78125rem' }}>
                    -{formatAmount(row.amount)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', whiteSpace: 'nowrap' }}>
                    {row.method || ''}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography sx={{ fontSize: '0.71875rem', color: MUTED }} noWrap>
                      {row.bank_description || ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {row.event_code ? (
                      <CellChip
                        label={`${eventName(row.event_code)} ▾`}
                        color={PURPLE}
                        bg={PURPLE_BG}
                        ariaLabel={`Event for expense ${row.id}`}
                        onClick={(e) => setEventMenu({ anchorEl: e.currentTarget, row })}
                      />
                    ) : (
                      <CellChip
                        label="＋ event"
                        dashed
                        ariaLabel={`Event for expense ${row.id}`}
                        onClick={(e) => setEventMenu({ anchorEl: e.currentTarget, row })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.expense_category_code ? (
                      <CellChip
                        label={`${categoryName(row.expense_category_code)} ▾`}
                        color={TEAL}
                        bg={TEAL_BG}
                        ariaLabel={`Category for expense ${row.id}`}
                        onClick={(e) => setCategoryMenu({ anchorEl: e.currentTarget, row })}
                      />
                    ) : (
                      <CellChip
                        label="＋ category 类别"
                        dashed
                        ariaLabel={`Category for expense ${row.id}`}
                        onClick={(e) => setCategoryMenu({ anchorEl: e.currentTarget, row })}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right', width: 44 }}>
                    <IconButton
                      size="small"
                      aria-label={`Delete expense ${row.id}`}
                      onClick={() => setDeleteTarget(row)}
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

      {/* Bulk classify bar */}
      {selected.length > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap',
          backgroundColor: INK, color: 'white', borderRadius: '12px',
          px: 2, py: 1.25, mt: 1.5,
        }}>
          <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>
            ☑ {selected.length} rows selected 已选 {selected.length} 行 →
          </Typography>
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
          <Typography sx={{ fontSize: '0.78125rem' }}>set Category 类别:</Typography>
          <Select
            size="small"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            displayEmpty
            inputProps={{ 'aria-label': 'Bulk category 批量类别' }}
            sx={{ backgroundColor: 'white', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, '& .MuiSelect-select': { py: 0.5 } }}
          >
            <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>— keep 保持 —</MenuItem>
            {expenseCategories.map((c) => (
              <MenuItem key={c.code} value={c.code} sx={{ fontSize: '0.8125rem' }}>{c.name}</MenuItem>
            ))}
          </Select>
          <Button
            size="small"
            onClick={handleBulkApply}
            disabled={applying || (bulkEvent === '' && bulkCategory === '')}
            sx={pillButtonSx}
          >
            {applying ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Apply 应用'}
          </Button>
          <Button size="small" onClick={() => setSelected([])} sx={{ textTransform: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.71875rem' }}>
            Clear 清除
          </Button>
        </Box>
      )}

      {/* Event chip menu */}
      <Menu anchorEl={eventMenu?.anchorEl} open={Boolean(eventMenu)} onClose={() => setEventMenu(null)}>
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

      {/* Category chip menu */}
      <Menu anchorEl={categoryMenu?.anchorEl} open={Boolean(categoryMenu)} onClose={() => setCategoryMenu(null)}>
        {expenseCategories.map((c) => (
          <MenuItem
            key={c.code}
            onClick={() => handlePickCategory(categoryMenu.row, c.code)}
            sx={{ fontSize: '0.8125rem', fontWeight: 600, color: TEAL }}
          >
            {c.name}
          </MenuItem>
        ))}
      </Menu>

      {/* Delete confirm dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete expense 删除支出?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.8125rem', color: MUTED }}>
            {deleteTarget?.vendor} · -{formatAmount(deleteTarget?.amount)} · {formatDate(deleteTarget?.expense_date)}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel 取消</Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            sx={{ ...pillButtonSx, backgroundColor: RED, '&:hover': { backgroundColor: '#a51f1f', boxShadow: 'none' } }}
          >
            {deleting ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Delete 删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
