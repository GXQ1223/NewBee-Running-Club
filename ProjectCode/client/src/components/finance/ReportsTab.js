import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useAuth } from '../../context';
import {
  getReportByEvent, getReportYoy, getReportPublicSupport, downloadByEventCsv,
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
const RED = '#c62828';

const SUBTABS = [
  { key: 'byEvent', label: 'By Event 按活动' },
  { key: 'yoy', label: 'YoY 同比' },
  { key: 'publicSupport', label: 'Public support 509(a)' },
];

const fmtMoney = (value) => {
  const n = Number(value || 0);
  if (n === 0) return '—';
  const abs = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
};

const fmtExpense = (value) => {
  const n = Number(value || 0);
  if (n === 0) return '—';
  return `-$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const fmtPct = (ratio) =>
  `${(Number(ratio || 0) * 100).toFixed(1)}%`;

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const headCellSx = {
  fontSize: '0.625rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase',
  letterSpacing: '0.4px', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
};

function PassChip({ passes }) {
  return (
    <Chip
      size="small"
      label={passes ? 'PASS 通过' : 'FAIL 未通过'}
      sx={{
        fontSize: '0.65625rem', fontWeight: 700, borderRadius: '99px', height: 20,
        backgroundColor: passes ? GREEN_BG : '#fdecea',
        color: passes ? GREEN : RED,
      }}
    />
  );
}

export default function ReportsTab() {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [subtab, setSubtab] = useState('byEvent');
  const [error, setError] = useState('');
  const [year, setYear] = useState('');
  const [byEvent, setByEvent] = useState(null);
  const [yoy, setYoy] = useState(null);
  const [publicSupport, setPublicSupport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      const [yoyData, supportData] = await Promise.all([
        getReportYoy(firebaseUid),
        getReportPublicSupport(firebaseUid),
      ]);
      setYoy(yoyData);
      setPublicSupport(supportData);
    } catch (err) {
      console.error('Error loading reports:', err);
      setError('Failed to load reports. / 加载报表失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!firebaseUid) return;
    let cancelled = false;
    getReportByEvent(year || undefined, firebaseUid)
      .then((data) => { if (!cancelled) setByEvent(data); })
      .catch((err) => {
        console.error('Error loading by-event report:', err);
        if (!cancelled) setError('Failed to load the by-event report. / 加载活动报表失败。');
      });
    return () => { cancelled = true; };
  }, [firebaseUid, year]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const { blob, filename } = await downloadByEventCsv(year || undefined, firebaseUid);
      triggerDownload(blob, filename);
    } catch (err) {
      console.error('Error exporting CSV:', err);
      setError('Failed to export the CSV. / 导出 CSV 失败。');
    } finally {
      setExporting(false);
    }
  };

  if (loading && !yoy && !publicSupport) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  const years = yoy?.years || [];

  return (
    <Box>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      {/* Sub-report chips */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {SUBTABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            onClick={() => setSubtab(t.key)}
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '99px',
              cursor: 'pointer',
              border: `1.5px solid ${subtab === t.key ? ORANGE : LINE}`,
              backgroundColor: subtab === t.key ? ORANGE : 'white',
              color: subtab === t.key ? 'white' : MUTED,
              '&:hover': { backgroundColor: subtab === t.key ? ORANGE_DARK : ORANGE_BG },
            }}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        {subtab === 'byEvent' && (
          <>
            <Select
              size="small"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Report year 年份' }}
              sx={{ borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, minWidth: 130, '& .MuiSelect-select': { py: 0.5 } }}
            >
              <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>All years 全部年份</MenuItem>
              {years.map((y) => (
                <MenuItem key={y} value={y} sx={{ fontSize: '0.8125rem' }}>{y}</MenuItem>
              ))}
            </Select>
            <Button
              size="small"
              startIcon={exporting
                ? <CircularProgress size={14} sx={{ color: ORANGE }} />
                : <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={handleExport}
              disabled={exporting}
              sx={{
                textTransform: 'none', fontWeight: 700, borderRadius: '99px', px: 2,
                border: `1.5px solid ${ORANGE}`, color: ORANGE, boxShadow: 'none',
                '&:hover': { backgroundColor: ORANGE, color: 'white' },
              }}
            >
              Export CSV 导出
            </Button>
          </>
        )}
      </Box>

      {/* By Event matrix */}
      {subtab === 'byEvent' && byEvent && (
        <TableContainer component={Paper} elevation={0} sx={{
          border: `1px solid ${LINE}`, borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
                <TableCell sx={headCellSx}>
                  {byEvent.year ? `FY${byEvent.year} · ` : ''}Income 收入
                </TableCell>
                <TableCell sx={headCellSx}>Donation 捐款</TableCell>
                <TableCell sx={headCellSx}>Event Revenue 活动收入</TableCell>
                <TableCell sx={headCellSx}>Pass-through 代收</TableCell>
                <TableCell sx={headCellSx}>TOTAL 合计</TableCell>
                <TableCell sx={headCellSx}>Expenses 支出</TableCell>
                <TableCell sx={headCellSx}>NET 净额</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(byEvent.events || []).map((ev) => (
                <TableRow key={ev.event_code} hover>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 700, backgroundColor: '#FDFBF7' }}>
                    {ev.event_name}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem' }}>{fmtMoney(ev.donation)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem' }}>{fmtMoney(ev.event_revenue)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem' }}>{fmtMoney(ev.pass_through)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>{fmtMoney(ev.income_total)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 700, color: RED }}>{fmtExpense(ev.expense_total)}</TableCell>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 700, color: Number(ev.net) < 0 ? RED : INK }}>{fmtMoney(ev.net)}</TableCell>
                </TableRow>
              ))}
              {byEvent.totals && (
                <TableRow>
                  {[
                    'TOTAL 合计',
                    fmtMoney(byEvent.totals.donation),
                    fmtMoney(byEvent.totals.event_revenue),
                    fmtMoney(byEvent.totals.pass_through),
                    fmtMoney(byEvent.totals.income_total),
                    fmtExpense(byEvent.totals.expense_total),
                    fmtMoney(byEvent.totals.net),
                  ].map((cell, i) => (
                    <TableCell key={i} sx={{
                      fontSize: '0.78125rem', fontWeight: 700,
                      backgroundColor: ORANGE_BG, color: ORANGE_DARK,
                    }}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Year over year */}
      {subtab === 'yoy' && yoy && (
        <TableContainer component={Paper} elevation={0} sx={{
          border: `1px solid ${LINE}`, borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
                <TableCell sx={headCellSx}>Event 活动</TableCell>
                {years.map((y) => (
                  <TableCell key={y} sx={headCellSx}>
                    {y} · income / expense / net
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {(yoy.events || []).map((ev) => (
                <TableRow key={ev.event_code} hover>
                  <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 700, backgroundColor: '#FDFBF7' }}>
                    {ev.event_name}
                  </TableCell>
                  {years.map((y) => {
                    const cell = ev.years?.[y];
                    return (
                      <TableCell key={y} sx={{ fontSize: '0.78125rem', whiteSpace: 'nowrap' }}>
                        {cell ? (
                          <>
                            {fmtMoney(cell.income)}
                            {' / '}
                            <Box component="span" sx={{ color: RED }}>{fmtExpense(cell.expense)}</Box>
                            {' / '}
                            <Box component="span" sx={{ fontWeight: 700, color: Number(cell.net) < 0 ? RED : INK }}>
                              {fmtMoney(cell.net)}
                            </Box>
                          </>
                        ) : '—'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Public support 509(a) */}
      {subtab === 'publicSupport' && publicSupport && (
        <Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
            <Paper elevation={0} sx={{ flex: 1, minWidth: 220, border: `1px solid ${LINE}`, borderRadius: '12px', p: 2 }}>
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                Support window 支持期 FY{(publicSupport.window_fys || []).join(' – FY')}
              </Typography>
              <Typography sx={{ fontSize: '0.78125rem', color: MUTED, mt: 1 }}>
                Contributions 捐款: <b>{fmtMoney(publicSupport.support?.contributions)}</b>
              </Typography>
              <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>
                Gross receipts 营业收入: <b>{fmtMoney(publicSupport.support?.gross_receipts)}</b>
              </Typography>
              <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>
                Total support 总支持: <b>{fmtMoney(publicSupport.support?.total_support)}</b>
              </Typography>
            </Paper>

            <Paper elevation={0} sx={{ flex: 1, minWidth: 220, border: `1px solid ${LINE}`, borderRadius: '12px', p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                  Test 1 · 509(a)(1)
                </Typography>
                <PassChip passes={publicSupport.test1_509a1?.passes} />
              </Box>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: publicSupport.test1_509a1?.passes ? GREEN : RED, mt: 0.5 }}>
                {fmtPct(publicSupport.test1_509a1?.ratio)}
              </Typography>
              <Typography sx={{ fontSize: '0.71875rem', color: MUTED }}>
                Public support 公共支持 {fmtMoney(publicSupport.test1_509a1?.public_support)} ·
                2% cap 上限 {fmtMoney(publicSupport.test1_509a1?.cap_2pct)} ·
                excluded 超限剔除 {fmtMoney(publicSupport.test1_509a1?.excluded_by_cap)}
              </Typography>
            </Paper>

            <Paper elevation={0} sx={{ flex: 1, minWidth: 220, border: `1px solid ${LINE}`, borderRadius: '12px', p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                  Test 2 · 509(a)(2)
                </Typography>
                <PassChip passes={publicSupport.test2_509a2?.passes} />
              </Box>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: publicSupport.test2_509a2?.passes ? GREEN : RED, mt: 0.5 }}>
                {fmtPct(publicSupport.test2_509a2?.ratio)}
              </Typography>
              <Typography sx={{ fontSize: '0.71875rem', color: MUTED }}>
                Public support 公共支持 {fmtMoney(publicSupport.test2_509a2?.public_support)} ·
                DQP excluded 关联人剔除 {fmtMoney(publicSupport.test2_509a2?.dqp_excluded)}
              </Typography>
            </Paper>
          </Box>

          <Paper elevation={0} sx={{ border: `1px solid ${LINE}`, borderRadius: '12px', p: 2, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>
              Headroom 安全余量 — max single gift 单笔最大捐款: 509(a)(1) <b>{fmtMoney(publicSupport.headroom?.max_gift_a1)}</b>
              {' · '}509(a)(2) <b>{fmtMoney(publicSupport.headroom?.max_gift_a2)}</b>
            </Typography>
          </Paper>

          {(publicSupport.test2_509a2?.dqp_rows || []).length > 0 && (
            <TableContainer component={Paper} elevation={0} sx={{
              border: `1px solid ${LINE}`, borderRadius: '12px', mb: 1.5,
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
                    <TableCell sx={headCellSx}>Disqualified person 关联人</TableCell>
                    <TableCell sx={headCellSx}>Amount 金额</TableCell>
                    <TableCell sx={headCellSx}>Reason 原因</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {publicSupport.test2_509a2.dqp_rows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78125rem' }}>{fmtMoney(row.amount)}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: MUTED }}>{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {(publicSupport.watch_list || []).length > 0 && (
            <TableContainer component={Paper} elevation={0} sx={{
              border: `1px solid ${LINE}`, borderRadius: '12px', mb: 1.5,
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
                    <TableCell sx={headCellSx}>Watch list 关注名单 — top donors 大额捐赠人</TableCell>
                    <TableCell sx={headCellSx}>Total 累计</TableCell>
                    <TableCell sx={headCellSx}>Insider 内部人</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {publicSupport.watch_list.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell sx={{ fontSize: '0.78125rem', fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78125rem' }}>{fmtMoney(row.total)}</TableCell>
                      <TableCell sx={{ fontSize: '0.78125rem' }}>
                        {row.insider ? (
                          <Chip size="small" label="insider 内部人" sx={{
                            fontSize: '0.625rem', fontWeight: 700, borderRadius: '99px', height: 18,
                            backgroundColor: '#fdecea', color: RED,
                          }} />
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography sx={{ fontSize: '0.6875rem', color: '#9a9a9a' }}>
            {publicSupport.disclaimer}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
