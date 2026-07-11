import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SyncIcon from '@mui/icons-material/Sync';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../context';
import {
  getDonationLedger, approveDonation, dismissDonation,
  sendThankYou, runGmailSync, downloadTaxReport
} from '../api/donors';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';
const GREEN = '#2e7d32';
const GREEN_BG = '#eaf5ea';
const BLUE = '#1a63d0';
const BLUE_BG = '#e8f0fe';

const FILTERS = [
  { key: 'all', label: 'All 全部' },
  { key: 'pending', label: 'Pending 待审核' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'manual', label: 'Manual 手动' },
];

const pillButtonSx = (solid) => ({
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: '99px',
  px: 2,
  boxShadow: 'none',
  border: solid ? 'none' : `1.5px solid ${ORANGE}`,
  color: solid ? 'white' : ORANGE,
  backgroundColor: solid ? ORANGE : 'transparent',
  '&:hover': {
    backgroundColor: solid ? ORANGE_DARK : ORANGE,
    color: 'white',
    boxShadow: 'none',
  },
});

const formatAmount = (amount) =>
  `$${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Auto-imported donations carry the source email excerpt; manual ones don't
const isGmailSourced = (donation) => Boolean(donation.email_excerpt);

// Provider label for Gmail-imported donations ('Zelle', 'Venmo', ...)
const gmailProvider = (donation) => {
  const src = (donation.source || '').toLowerCase();
  if (src.includes('venmo')) return 'Venmo';
  if (src.includes('zelle')) return 'Zelle';
  return null;
};

function StatTile({ label, value, sub, highlight, alert }) {
  return (
    <Paper elevation={0} sx={{
      border: `1px solid ${alert ? ORANGE : LINE}`,
      borderRadius: '12px',
      p: 2,
      backgroundColor: alert ? ORANGE_BG : 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      height: '100%'
    }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: highlight ? ORANGE : INK, mt: 0.5 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.71875rem', color: MUTED, mt: 0.25 }}>
        {sub}
      </Typography>
    </Paper>
  );
}

function SourceChip({ donation }) {
  const gmail = isGmailSourced(donation);
  const provider = gmailProvider(donation);
  return (
    <Chip
      size="small"
      label={gmail ? `✉ Gmail${provider ? ` · ${provider}` : ''}` : 'Manual 手动'}
      sx={{
        fontSize: '0.6875rem',
        fontWeight: 700,
        borderRadius: '99px',
        backgroundColor: gmail ? BLUE_BG : '#f1f1f1',
        color: gmail ? BLUE : MUTED,
      }}
    />
  );
}

export default function DonationLedger({ onLedgerChange }) {
  const { currentUser } = useAuth();
  const firebaseUid = currentUser?.uid;

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [pendingTypes, setPendingTypes] = useState({});
  const [thankTarget, setThankTarget] = useState(null);
  const [thankEmail, setThankEmail] = useState('');
  const [sendingThanks, setSendingThanks] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  // Tax report dialog
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [taxStart, setTaxStart] = useState(`${currentYear - 1}-01-01`);
  const [taxEnd, setTaxEnd] = useState(`${currentYear - 1}-12-31`);
  const [taxFormat, setTaxFormat] = useState('pdf');
  const [generating, setGenerating] = useState(false);

  const fetchLedger = useCallback(async () => {
    if (!firebaseUid) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDonationLedger(firebaseUid);
      setLedger(data);
    } catch (err) {
      console.error('Error fetching donation ledger:', err);
      setError('Failed to load donation ledger. / 加载捐款账本失败。');
    } finally {
      setLoading(false);
    }
  }, [firebaseUid]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleApprove = async (donation) => {
    setActingId(donation.donation_id);
    setError('');
    try {
      const corrections = {};
      const selectedType = pendingTypes[donation.donation_id];
      if (selectedType && selectedType !== donation.donor_type) {
        corrections.donor_type = selectedType;
      }
      await approveDonation(donation.donation_id, corrections, firebaseUid);
      await fetchLedger();
      if (onLedgerChange) onLedgerChange();
    } catch (err) {
      console.error('Error approving donation:', err);
      setError('Failed to approve donation. / 确认捐款失败。');
    } finally {
      setActingId(null);
    }
  };

  const handleDismiss = async (donation) => {
    setActingId(donation.donation_id);
    setError('');
    try {
      await dismissDonation(donation.donation_id, firebaseUid);
      await fetchLedger();
      if (onLedgerChange) onLedgerChange();
    } catch (err) {
      console.error('Error dismissing donation:', err);
      setError('Failed to dismiss donation. / 忽略捐款失败。');
    } finally {
      setActingId(null);
    }
  };

  const handleSendThankYou = async () => {
    if (!thankTarget || !thankEmail) return;
    setSendingThanks(true);
    setError('');
    try {
      await sendThankYou(thankTarget.donation_id, thankEmail, firebaseUid);
      setThankTarget(null);
      setThankEmail('');
      await fetchLedger();
    } catch (err) {
      console.error('Error sending thank-you email:', err);
      setError('Failed to send the thank-you email. / 发送感谢邮件失败。');
    } finally {
      setSendingThanks(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError('');
    try {
      await runGmailSync(firebaseUid);
      await fetchLedger();
    } catch (err) {
      console.error('Error running Gmail sync:', err);
      setError('Gmail sync failed. Check server Gmail credentials. / 邮件同步失败。');
    } finally {
      setSyncing(false);
    }
  };

  const setTaxRange = (start, end) => {
    setTaxStart(start);
    setTaxEnd(end);
  };

  const handleGenerateTaxReport = async () => {
    setGenerating(true);
    setError('');
    try {
      const { blob, filename } = await downloadTaxReport(
        { startDate: taxStart, endDate: taxEnd, format: taxFormat },
        firebaseUid
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setTaxDialogOpen(false);
    } catch (err) {
      console.error('Error generating tax report:', err);
      setError('Failed to generate tax file. / 生成税务文件失败。');
    } finally {
      setGenerating(false);
    }
  };

  if (loading && !ledger) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  const donations = ledger?.donations || [];
  const stats = ledger?.stats;
  const sync = ledger?.sync;

  // Ignored rows live in their own collapsible section below the main table
  const ignoredDonations = donations.filter((d) => d.status === 'dismissed');
  const filteredDonations = donations.filter((d) => {
    if (d.status === 'dismissed') return false;
    if (filter === 'pending') return d.status === 'pending';
    if (filter === 'gmail') return isGmailSourced(d);
    if (filter === 'manual') return !isGmailSourced(d);
    return true;
  });

  // Explain machine decisions: pull the auto-ignore note out of the notes
  const autoIgnoreNote = (donation) => {
    const match = (donation.notes || '').match(/Auto-ignored[^·]*$/);
    return match ? match[0].trim() : null;
  };

  // Client-side preview of what the tax report will include
  const taxSelection = donations.filter((d) =>
    d.status === 'confirmed' && d.donation_date &&
    d.donation_date >= taxStart && d.donation_date <= taxEnd
  );
  const taxTotal = taxSelection.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
  const taxDonors = new Set(taxSelection.map((d) => d.name)).size;

  return (
    <Box>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Stat tiles */}
      {stats && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={6} md={3}>
            <StatTile
              label={`${currentYear} YTD Total 今年累计`}
              value={formatAmount(stats.ytd_total)}
              sub={`${stats.ytd_count} donations 笔捐款`}
              highlight
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatTile
              label="All-time 历史累计"
              value={formatAmount(stats.alltime_total)}
              sub={`${stats.alltime_count} donations · ${stats.donor_count} donors`}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatTile
              label="Pending review 待审核"
              value={stats.pending_count}
              sub="from Gmail sync 来自邮件同步"
              highlight
              alert={stats.pending_count > 0}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatTile
              label="Thank-you not sent 未致谢"
              value={stats.unthanked_count}
              sub="of confirmed donations"
            />
          </Grid>
        </Grid>
      )}

      {/* Toolbar: filters, sync status, tax file */}
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

        <Typography sx={{ fontSize: '0.75rem', color: MUTED, ml: 1 }}>
          🔄 Gmail sync 邮件同步:{' '}
          {sync?.last_run ? (
            <>
              <Box component="span" sx={{ color: GREEN, fontWeight: 700 }}>● Healthy</Box>
              {' · last run '}{formatDate(sync.last_run)}
              {sync.next_run ? ` · next ${formatDate(sync.next_run)}` : ''}
            </>
          ) : (
            <Box component="span" sx={{ fontWeight: 700 }}>never run 尚未运行</Box>
          )}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Button
          size="small"
          startIcon={syncing ? <CircularProgress size={14} sx={{ color: ORANGE }} /> : <SyncIcon />}
          onClick={handleSyncNow}
          disabled={syncing}
          sx={pillButtonSx(false)}
        >
          Sync now 立即同步
        </Button>
        <Button
          size="small"
          startIcon={<ReceiptLongIcon />}
          onClick={() => setTaxDialogOpen(true)}
          sx={pillButtonSx(true)}
        >
          Generate Tax File 生成税务文件
        </Button>
      </Box>

      {/* Ledger table */}
      <TableContainer component={Paper} elevation={0} sx={{
        border: `1px solid ${LINE}`,
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#FDFBF7' }}>
              {['Date 日期', 'Donor 赞助者', 'Amount 金额', 'Source 来源', 'Receipt 收据', 'Thank-you 感谢邮件', ''].map((h) => (
                <TableCell key={h} sx={{ fontSize: '0.6875rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${LINE}` }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDonations.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: MUTED }}>
                  No donations found. / 暂无捐款记录。
                </TableCell>
              </TableRow>
            )}
            {filteredDonations.map((donation) => {
              const pending = donation.status === 'pending';
              const expanded = expandedId === donation.donation_id;
              const acting = actingId === donation.donation_id;
              return (
                <React.Fragment key={donation.donation_id}>
                  <TableRow
                    hover
                    onClick={() => setExpandedId(expanded ? null : donation.donation_id)}
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: pending ? '#FFFDF8' : 'inherit',
                      borderLeft: pending ? `3px solid ${ORANGE}` : 'none',
                      '&:hover': { backgroundColor: ORANGE_BG },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(donation.donation_date)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography component="span" sx={{ fontSize: '0.84375rem', fontWeight: pending ? 700 : 500 }}>
                          {donation.name}
                        </Typography>
                        {pending && (
                          <Chip size="small" label="PENDING 待审核" sx={{ fontSize: '0.625rem', fontWeight: 700, backgroundColor: ORANGE, color: 'white', borderRadius: '99px', height: 18 }} />
                        )}
                        {donation.hide_name && (
                          <Chip size="small" label="anonymous 匿名" sx={{ fontSize: '0.625rem', fontWeight: 700, backgroundColor: '#f1f1f1', color: MUTED, borderRadius: '99px', height: 18 }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: ORANGE, whiteSpace: 'nowrap' }}>
                      {formatAmount(donation.amount)}
                    </TableCell>
                    <TableCell><SourceChip donation={donation} /></TableCell>
                    <TableCell>
                      {donation.receipt_confirmed ? (
                        <Chip size="small" label="✓" sx={{ fontSize: '0.6875rem', fontWeight: 700, backgroundColor: GREEN_BG, color: GREEN, borderRadius: '99px' }} />
                      ) : '—'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {pending ? (
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                          <Button
                            size="small"
                            startIcon={acting ? <CircularProgress size={12} sx={{ color: 'white' }} /> : <CheckIcon sx={{ fontSize: 14 }} />}
                            onClick={() => handleApprove(donation)}
                            disabled={acting}
                            sx={{ ...pillButtonSx(true), fontSize: '0.6875rem', py: 0.25 }}
                          >
                            Approve 确认
                          </Button>
                          <Button
                            size="small"
                            startIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                            onClick={() => handleDismiss(donation)}
                            disabled={acting}
                            sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, borderRadius: '99px', border: `1.5px solid ${LINE}`, color: MUTED, py: 0.25, px: 1.5 }}
                          >
                            Ignore 忽略
                          </Button>
                        </Box>
                      ) : donation.thank_you_sent_at ? (
                        <Typography sx={{ fontSize: '0.71875rem', color: GREEN, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ✓ Sent {formatDate(donation.thank_you_sent_at)}
                        </Typography>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => { setThankTarget(donation); setThankEmail(''); }}
                          sx={{ ...pillButtonSx(false), fontSize: '0.6875rem', py: 0.25 }}
                        >
                          Send thank-you 发送感谢
                        </Button>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', width: 130 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        {!pending && (
                          <Box onClick={(e) => e.stopPropagation()}>
                            <Tooltip title="Not a donation? Move it to the Ignored section — restorable anytime. / 非捐款？移入下方忽略区，可随时恢复">
                              <span>
                                <Button
                                  size="small"
                                  startIcon={<CloseIcon sx={{ fontSize: 13 }} />}
                                  onClick={() => handleDismiss(donation)}
                                  disabled={acting}
                                  sx={{ textTransform: 'none', fontSize: '0.65625rem', fontWeight: 700, borderRadius: '99px', border: `1.5px solid ${LINE}`, color: MUTED, py: 0.125, px: 1.25, '&:hover': { borderColor: '#c62828', color: '#c62828' } }}
                                >
                                  Ignore 忽略
                                </Button>
                              </span>
                            </Tooltip>
                          </Box>
                        )}
                        <KeyboardArrowDownIcon sx={{
                          fontSize: 18,
                          color: ORANGE,
                          transition: 'transform 0.25s',
                          transform: expanded ? 'rotate(180deg)' : 'none'
                        }} />
                      </Box>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={7} sx={{ p: 0, borderBottom: expanded ? `1px solid ${LINE}` : 'none' }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ backgroundColor: '#FDFBF7', px: 3, py: 2 }}>
                          {pending && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }} onClick={(e) => e.stopPropagation()}>
                              <Typography sx={{ fontSize: '0.78125rem', color: MUTED }}>
                                Donor type 赞助者类型:
                              </Typography>
                              <Select
                                size="small"
                                value={pendingTypes[donation.donation_id] || donation.donor_type}
                                onChange={(e) => setPendingTypes((prev) => ({ ...prev, [donation.donation_id]: e.target.value }))}
                                sx={{ fontSize: '0.78125rem', borderRadius: '8px' }}
                              >
                                <MenuItem value="individual">Individual 个人</MenuItem>
                                <MenuItem value="enterprise">Enterprise 企业</MenuItem>
                              </Select>
                            </Box>
                          )}
                          {donation.email_excerpt && (
                            <Box sx={{ backgroundColor: BLUE_BG, borderRadius: '8px', px: 1.5, py: 1, mb: donation.notes ? 1 : 0 }}>
                              <Typography sx={{ fontSize: '0.75rem', color: MUTED, lineHeight: 1.6 }}>
                                <Box component="span" sx={{ color: BLUE, fontWeight: 700 }}>✉ </Box>
                                {donation.email_excerpt}
                              </Typography>
                            </Box>
                          )}
                          {donation.notes && (
                            <Typography sx={{ fontSize: '0.75rem', color: MUTED, lineHeight: 1.6 }}>
                              Notes 备注: {donation.notes}
                            </Typography>
                          )}
                          {!donation.email_excerpt && !donation.notes && (
                            <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
                              No additional details. / 无更多详情。
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Ignored section — the permanent record of non-donations; also what
          stops the Gmail sync from re-importing them. Restorable anytime. */}
      <Paper elevation={0} sx={{ mt: 2, border: `1px solid ${LINE}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <Box
          onClick={() => setIgnoredOpen(!ignoredOpen)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, py: 1.5, backgroundColor: '#FAFAFA', cursor: 'pointer', userSelect: 'none' }}
        >
          <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700, color: MUTED }}>
            Ignored 已忽略
          </Typography>
          <Chip size="small" label={ignoredDonations.length} sx={{ fontSize: '0.65625rem', fontWeight: 700, backgroundColor: '#e0e0e0', color: '#777', borderRadius: '99px', height: 20 }} />
          <Typography sx={{ fontSize: '0.71875rem', color: '#9a9a9a' }}>
            carpool fees, gear payments, mistakes — restore anytime / 拼车、装备、误操作，可随时恢复
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <KeyboardArrowDownIcon sx={{
            fontSize: 18,
            color: MUTED,
            transition: 'transform 0.25s',
            transform: ignoredOpen ? 'rotate(180deg)' : 'none'
          }} />
        </Box>
        <Collapse in={ignoredOpen} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableBody>
              {ignoredDonations.length === 0 && (
                <TableRow>
                  <TableCell sx={{ textAlign: 'center', py: 3, color: '#9a9a9a' }}>
                    Nothing ignored yet. / 暂无已忽略的记录。
                  </TableCell>
                </TableRow>
              )}
              {ignoredDonations.map((donation) => (
                <TableRow key={donation.donation_id} sx={{ '& td': { backgroundColor: '#FAFAFA', color: '#9a9a9a' } }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(donation.donation_date)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography component="span" sx={{ fontSize: '0.84375rem', fontWeight: 500 }}>
                        {donation.name}
                      </Typography>
                      {autoIgnoreNote(donation) && (
                        <Tooltip title={autoIgnoreNote(donation)}>
                          <Chip size="small" label="AUTO" sx={{ fontSize: '0.625rem', fontWeight: 700, backgroundColor: '#f3e8ff', color: '#7b3ff2', borderRadius: '99px', height: 18 }} />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatAmount(donation.amount)}</TableCell>
                  <TableCell><SourceChip donation={donation} /></TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9a9a9a' }} noWrap>
                      {donation.message || donation.email_excerpt || ''}
                    </Typography>
                    {autoIgnoreNote(donation) && (
                      <Typography sx={{ fontSize: '0.6875rem', color: '#b0b0b0' }}>
                        {autoIgnoreNote(donation)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button
                      size="small"
                      startIcon={actingId === donation.donation_id ? <CircularProgress size={12} sx={{ color: GREEN }} /> : <CheckIcon sx={{ fontSize: 14 }} />}
                      onClick={() => handleApprove(donation)}
                      disabled={actingId === donation.donation_id}
                      sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, borderRadius: '99px', border: `1.5px solid ${GREEN}`, color: GREEN, py: 0.25, px: 1.5, '&:hover': { backgroundColor: GREEN, color: 'white' } }}
                    >
                      Restore 恢复为已确认
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Collapse>
      </Paper>

      {/* Send thank-you dialog */}
      <Dialog open={Boolean(thankTarget)} onClose={() => setThankTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>✉ Send thank-you email 发送感谢邮件</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', mb: 1 }}>
            {thankTarget?.name} · {formatAmount(thankTarget?.amount)} · {formatDate(thankTarget?.donation_date)}
          </Typography>
          <Typography sx={{ fontSize: '0.78125rem', color: MUTED, mb: 2 }}>
            Payment emails don't include the donor's address — enter it below. A bilingual thank-you letter will be sent from the club Gmail. / 付款邮件不含捐赠者邮箱，请填写收件地址；系统将从跑团邮箱发送中英双语感谢信。
          </Typography>
          <TextField
            label="Donor email 捐赠者邮箱"
            type="email"
            size="small"
            fullWidth
            autoFocus
            value={thankEmail}
            onChange={(e) => setThankEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setThankTarget(null)} disabled={sendingThanks}>Cancel 取消</Button>
          <Button
            variant="contained"
            onClick={handleSendThankYou}
            disabled={sendingThanks || !thankEmail.includes('@')}
            sx={pillButtonSx(true)}
          >
            {sendingThanks ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'Send 发送'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tax file dialog */}
      <Dialog open={taxDialogOpen} onClose={() => setTaxDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🧾 Generate Tax File 生成税务文件</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.8125rem', color: MUTED, mb: 2 }}>
            Export confirmed donations in a date range for tax filing. / 导出指定时间范围内所有已确认的捐款记录。
          </Typography>

          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', mb: 1 }}>
            Time range 时间范围
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {[
              { label: `Tax Year ${currentYear - 1} 税务年度`, start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` },
              { label: `Tax Year ${currentYear - 2}`, start: `${currentYear - 2}-01-01`, end: `${currentYear - 2}-12-31` },
              { label: `${currentYear} YTD 今年至今`, start: `${currentYear}-01-01`, end: new Date().toISOString().split('T')[0] },
            ].map((range) => (
              <Chip
                key={range.label}
                label={range.label}
                onClick={() => setTaxRange(range.start, range.end)}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: '99px',
                  cursor: 'pointer',
                  border: `1.5px solid ${taxStart === range.start && taxEnd === range.end ? ORANGE : LINE}`,
                  backgroundColor: taxStart === range.start && taxEnd === range.end ? ORANGE : 'white',
                  color: taxStart === range.start && taxEnd === range.end ? 'white' : MUTED,
                }}
              />
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            <TextField
              label="From 从"
              type="date"
              size="small"
              value={taxStart}
              onChange={(e) => setTaxStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="To 至"
              type="date"
              size="small"
              value={taxEnd}
              onChange={(e) => setTaxEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>

          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', mb: 1 }}>
            Format 格式
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
            {[
              { key: 'pdf', title: 'PDF Summary 汇总', desc: 'Totals by donor 按捐赠人汇总' },
              { key: 'csv', title: 'CSV Detail 明细', desc: 'Every donation row 每笔明细' },
            ].map((fmt) => (
              <Box
                key={fmt.key}
                onClick={() => setTaxFormat(fmt.key)}
                sx={{
                  flex: 1,
                  border: `1.5px solid ${taxFormat === fmt.key ? ORANGE : LINE}`,
                  backgroundColor: taxFormat === fmt.key ? ORANGE_BG : 'white',
                  borderRadius: '10px',
                  p: 1.5,
                  cursor: 'pointer',
                }}
              >
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: INK }}>{fmt.title}</Typography>
                <Typography sx={{ fontSize: '0.71875rem', color: MUTED }}>{fmt.desc}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ backgroundColor: '#FDFBF7', borderRadius: '8px', px: 1.5, py: 1 }}>
            <Typography sx={{ fontSize: '0.71875rem', color: MUTED }}>
              {taxSelection.length} donations · {formatAmount(taxTotal)} · {taxDonors} donors ｜ 包含 {taxSelection.length} 笔捐款，共 {formatAmount(taxTotal)}，{taxDonors} 位捐赠人
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTaxDialogOpen(false)} disabled={generating}>
            Cancel 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleGenerateTaxReport}
            disabled={generating || !taxStart || !taxEnd}
            sx={pillButtonSx(true)}
          >
            {generating ? <CircularProgress size={20} sx={{ color: 'white' }} /> : '⬇ Generate & Download 生成并下载'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
