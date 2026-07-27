import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton,
  MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SyncIcon from '@mui/icons-material/Sync';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import {
  getDonationLedger, approveDonation, dismissDonation, sendThankYou,
  markThankYouSent, getThankYouPreview, getThankYouTemplates, createThankYouTemplate,
  updateThankYouTemplate, deleteThankYouTemplate, downloadReceipt,
  updateDonor, runGmailSync, downloadTaxReport
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

const PURPLE = '#7b3ff2';
const PURPLE_BG = '#f3e8ff';

const formatAmount = (amount) =>
  `$${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const navigate = useNavigate();
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
  const [thankSubject, setThankSubject] = useState('');
  const [thankMessage, setThankMessage] = useState('');
  const [thankTemplateId, setThankTemplateId] = useState(0);
  const [thankTemplates, setThankTemplates] = useState([]);
  const [thankAttach, setThankAttach] = useState(true);
  const [sendingThanks, setSendingThanks] = useState(false);
  const [markingThankedId, setMarkingThankedId] = useState(null);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [receiptingId, setReceiptingId] = useState(null);

  // Templates manager
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplForm, setTplForm] = useState(null); // {id?, name, min_amount, subject, body}
  const [tplSaving, setTplSaving] = useState(false);

  // Editable notes (expanded rows)
  const [notesEditId, setNotesEditId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

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

  const openThankDialog = async (donation) => {
    setThankTarget(donation);
    setThankEmail(donation.email || '');
    setThankSubject('');
    setThankMessage('');
    setThankTemplateId(0);
    setThankTemplates([]);
    setThankAttach(true);
    try {
      const [preview, templateList] = await Promise.all([
        getThankYouPreview(donation.donation_id, firebaseUid),
        getThankYouTemplates(firebaseUid),
      ]);
      setThankSubject(preview.subject || '');
      setThankMessage(preview.body || '');
      setThankTemplateId(preview.template_id || 0);
      setThankTemplates(templateList);
    } catch (err) {
      console.error('Error loading thank-you preview:', err);
      setError('Failed to load the letter preview. / 加载感谢信预览失败。');
    }
  };

  const handleSwitchTemplate = async (templateId) => {
    if (!thankTarget) return;
    setThankTemplateId(templateId);
    try {
      const preview = await getThankYouPreview(thankTarget.donation_id, firebaseUid, templateId);
      setThankSubject(preview.subject || '');
      setThankMessage(preview.body || '');
    } catch (err) {
      console.error('Error switching template:', err);
      setError('Failed to load that template. / 切换模板失败。');
    }
  };

  const handleSendThankYou = async () => {
    if (!thankTarget || !thankEmail) return;
    setSendingThanks(true);
    setError('');
    try {
      await sendThankYou(thankTarget.donation_id, {
        email: thankEmail,
        subject: thankSubject,
        message: thankMessage,
        attachReceipt: thankAttach,
      }, firebaseUid);
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

  const handleMarkThankYouSent = async (donation) => {
    setMarkingThankedId(donation.donation_id);
    setError('');
    try {
      await markThankYouSent(donation.donation_id, undefined, firebaseUid);
      await fetchLedger();
    } catch (err) {
      console.error('Error marking thank-you as sent:', err);
      setError('Failed to mark as already thanked. / 标记为已致谢失败。');
    } finally {
      setMarkingThankedId(null);
    }
  };

  const handleDownloadReceipt = async (donation) => {
    setReceiptingId(donation.donation_id);
    setError('');
    try {
      const { blob, filename } = await downloadReceipt(donation.donation_id, firebaseUid);
      triggerDownload(blob, filename);
    } catch (err) {
      console.error('Error downloading receipt:', err);
      setError('Failed to generate the receipt. / 生成收据失败。');
    } finally {
      setReceiptingId(null);
    }
  };

  const openTemplates = async () => {
    setTemplatesOpen(true);
    setTplForm(null);
    try {
      setTemplates(await getThankYouTemplates(firebaseUid));
    } catch (err) {
      console.error('Error loading templates:', err);
      setError('Failed to load templates. / 加载模板失败。');
    }
  };

  const handleSaveTemplate = async () => {
    if (!tplForm) return;
    setTplSaving(true);
    setError('');
    try {
      const payload = {
        name: tplForm.name,
        min_amount: tplForm.min_amount || 0,
        subject: tplForm.subject,
        body: tplForm.body,
      };
      if (tplForm.id) {
        await updateThankYouTemplate(tplForm.id, payload, firebaseUid);
      } else {
        await createThankYouTemplate(payload, firebaseUid);
      }
      setTplForm(null);
      setTemplates(await getThankYouTemplates(firebaseUid));
    } catch (err) {
      console.error('Error saving template:', err);
      setError('Failed to save the template. / 保存模板失败。');
    } finally {
      setTplSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    setError('');
    try {
      await deleteThankYouTemplate(templateId, firebaseUid);
      setTemplates(await getThankYouTemplates(firebaseUid));
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete the template. / 删除模板失败。');
    }
  };

  const handleSaveNotes = async (donation) => {
    setNotesSaving(true);
    setError('');
    try {
      await updateDonor(donation.donor_id, { notes: notesDraft }, firebaseUid);
      setNotesEditId(null);
      await fetchLedger();
    } catch (err) {
      console.error('Error saving notes:', err);
      setError('Failed to save notes. / 保存备注失败。');
    } finally {
      setNotesSaving(false);
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
          onClick={() => navigate('/finance')}
          sx={{
            textTransform: 'none', fontWeight: 700, borderRadius: '99px', px: 2,
            border: `1.5px solid ${LINE}`, color: MUTED, boxShadow: 'none',
            '&:hover': { borderColor: ORANGE, color: ORANGE },
          }}
        >
          📚 Finance 财务工作台 →
        </Button>
        <Button
          size="small"
          onClick={openTemplates}
          sx={{
            textTransform: 'none', fontWeight: 700, borderRadius: '99px', px: 2,
            border: `1.5px solid ${PURPLE}`, color: PURPLE, boxShadow: 'none',
            '&:hover': { backgroundColor: PURPLE, color: 'white' },
          }}
        >
          ✉ Templates 模板
        </Button>
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
              {['Date 日期', 'Donor 捐赠者', 'Amount 金额', 'Source 来源', 'Receipt 收据', 'Thank-you 感谢邮件', ''].map((h) => (
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {donation.receipt_confirmed ? (
                          <Chip size="small" label="✓" sx={{ fontSize: '0.6875rem', fontWeight: 700, backgroundColor: GREEN_BG, color: GREEN, borderRadius: '99px' }} />
                        ) : '—'}
                        {!pending && (
                          <Tooltip title="Download official donation receipt PDF / 下载捐款收据">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => handleDownloadReceipt(donation)}
                                disabled={receiptingId === donation.donation_id}
                                aria-label="Receipt 收据"
                              >
                                {receiptingId === donation.donation_id
                                  ? <CircularProgress size={14} sx={{ color: BLUE }} />
                                  : <FileDownloadOutlinedIcon sx={{ fontSize: 17, color: BLUE }} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Button
                            size="small"
                            onClick={() => openThankDialog(donation)}
                            sx={{ ...pillButtonSx(false), fontSize: '0.6875rem', py: 0.25 }}
                          >
                            Send thank-you 发送感谢
                          </Button>
                          <Tooltip title="Already thanked outside the app (call, card, prior email) — just clear this flag, no email is sent. / 已在系统外致谢过（电话、卡片、之前的邮件）——只清除此标记，不发送邮件。">
                            <span>
                              <Button
                                size="small"
                                onClick={() => handleMarkThankYouSent(donation)}
                                disabled={markingThankedId === donation.donation_id}
                                startIcon={markingThankedId === donation.donation_id
                                  ? <CircularProgress size={12} sx={{ color: MUTED }} />
                                  : undefined}
                                sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, color: MUTED, py: 0.25, px: 1, minWidth: 0, '&:hover': { color: GREEN, backgroundColor: 'transparent' } }}
                              >
                                Already sent 已发送
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
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
                                Donor type 捐赠者类型:
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
                          {notesEditId === donation.donation_id ? (
                            <Box onClick={(e) => e.stopPropagation()}>
                              <TextField
                                label="Notes 备注"
                                multiline
                                minRows={3}
                                fullWidth
                                size="small"
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                sx={{ backgroundColor: 'white' }}
                              />
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                                <Button size="small" onClick={() => setNotesEditId(null)} disabled={notesSaving} sx={{ textTransform: 'none', color: MUTED }}>
                                  Cancel 取消
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => handleSaveNotes(donation)}
                                  disabled={notesSaving}
                                  sx={{ ...pillButtonSx(true), fontSize: '0.6875rem', py: 0.25 }}
                                >
                                  {notesSaving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Save 保存'}
                                </Button>
                              </Box>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.75rem', color: MUTED, lineHeight: 1.6, whiteSpace: 'pre-line', flexGrow: 1 }}>
                                Notes 备注: {donation.notes || '—'}
                              </Typography>
                              <Button
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNotesEditId(donation.donation_id);
                                  setNotesDraft(donation.notes || '');
                                }}
                                sx={{ textTransform: 'none', fontSize: '0.6875rem', fontWeight: 700, color: ORANGE, whiteSpace: 'nowrap', minWidth: 0 }}
                              >
                                ✎ Edit 编辑
                              </Button>
                            </Box>
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
      <Dialog open={Boolean(thankTarget)} onClose={() => setThankTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>✉ Send thank-you email 发送感谢邮件</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 1 }}>
            {thankTarget?.name} · {formatAmount(thankTarget?.amount)} · {formatDate(thankTarget?.donation_date)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', backgroundColor: PURPLE_BG, borderRadius: '9px', px: 1.5, py: 1, mb: 2 }}>
            <Typography sx={{ fontSize: '0.75rem', color: PURPLE, fontWeight: 600 }}>
              Template 模板:
            </Typography>
            <Select
              size="small"
              value={thankTemplateId}
              onChange={(e) => handleSwitchTemplate(e.target.value)}
              inputProps={{ 'aria-label': 'Template 模板' }}
              sx={{ fontSize: '0.78125rem', fontWeight: 700, color: PURPLE, borderRadius: '8px', backgroundColor: 'white', minWidth: 220, '& .MuiSelect-select': { py: 0.5 } }}
            >
              {thankTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id} sx={{ fontSize: '0.8125rem' }}>
                  {template.name} · ≥ {formatAmount(template.min_amount)}
                </MenuItem>
              ))}
              <MenuItem value={0} sx={{ fontSize: '0.8125rem' }}>Built-in default 内置模板</MenuItem>
            </Select>
            <Typography sx={{ fontSize: '0.71875rem', color: PURPLE }}>
              switching refills the letter; edit anything before sending 切换模板会重新填充，可再修改
            </Typography>
          </Box>
          <TextField
            label="Subject 邮件标题"
            size="small"
            fullWidth
            value={thankSubject}
            onChange={(e) => setThankSubject(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Message 正文"
            multiline
            minRows={9}
            fullWidth
            size="small"
            value={thankMessage}
            onChange={(e) => setThankMessage(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Donor email 捐赠者邮箱"
            type="email"
            size="small"
            fullWidth
            value={thankEmail}
            onChange={(e) => setThankEmail(e.target.value)}
            helperText={thankTarget?.email
              ? 'Remembered from a previous thank-you — edit if it changed. / 已记住上次填写的邮箱，如有变化可修改。'
              : "Payment emails don't include the donor's address — enter it here. It's remembered for next time. / 付款邮件不含捐赠者邮箱，请填写；系统会记住以便下次使用。"}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={thankAttach}
                onChange={(e) => setThankAttach(e.target.checked)}
                sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.8125rem' }}>
                Attach donation receipt PDF 随邮件附上捐款收据
              </Typography>
            }
            sx={{ mt: 1 }}
          />
          <Typography sx={{ fontSize: '0.71875rem', color: MUTED, mt: 0.5 }}>
            The exact subject + message you send is recorded into the donation's notes. / 实际发送的标题和正文将完整记录到该捐款的备注中。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setThankTarget(null)} disabled={sendingThanks}>Cancel 取消</Button>
          <Button
            variant="contained"
            onClick={handleSendThankYou}
            disabled={sendingThanks || !thankEmail.includes('@') || !thankMessage.trim()}
            sx={pillButtonSx(true)}
          >
            {sendingThanks ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'Send 发送'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Thank-you templates manager */}
      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>✉ Thank-you templates 感谢信模板</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.78125rem', color: MUTED, mb: 2, lineHeight: 1.6 }}>
            Each donation uses the template with the highest tier at or below its amount. 每笔捐款自动匹配「不超过其金额的最高档位」模板。Placeholders 可用变量:
            {' '}<Chip size="small" label="{name}" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', height: 20, backgroundColor: '#e8f0fe', color: BLUE }} />
            {' '}<Chip size="small" label="{amount}" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', height: 20, backgroundColor: '#e8f0fe', color: BLUE }} />
            {' '}<Chip size="small" label="{date}" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', height: 20, backgroundColor: '#e8f0fe', color: BLUE }} />
            {' '}<Chip size="small" label="{date_cn}" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', height: 20, backgroundColor: '#e8f0fe', color: BLUE }} />
            {' '}<Chip size="small" label="{payment_method}" sx={{ fontFamily: 'monospace', fontSize: '0.6875rem', height: 20, backgroundColor: '#e8f0fe', color: BLUE }} />
          </Typography>

          {templates.map((template) => (
            <Box key={template.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.25, borderBottom: `1px solid ${LINE}` }}>
              <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700 }}>{template.name}</Typography>
              <Chip size="small" label={`≥ ${formatAmount(template.min_amount)}`} sx={{ fontSize: '0.6875rem', fontWeight: 700, backgroundColor: PURPLE_BG, color: PURPLE, borderRadius: '99px', height: 20 }} />
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" onClick={() => setTplForm({ ...template })} sx={{ textTransform: 'none', fontSize: '0.71875rem', fontWeight: 700, color: ORANGE }}>
                ✎ Edit 编辑
              </Button>
              <Button size="small" onClick={() => handleDeleteTemplate(template.id)} sx={{ textTransform: 'none', fontSize: '0.71875rem', fontWeight: 700, color: '#c62828' }}>
                Delete 删除
              </Button>
            </Box>
          ))}
          {templates.length === 0 && !tplForm && (
            <Typography sx={{ fontSize: '0.78125rem', color: MUTED, py: 1 }}>
              No templates yet — the built-in bilingual letter is used. / 尚未配置模板，当前使用内置双语感谢信。
            </Typography>
          )}

          {tplForm ? (
            <Box sx={{ backgroundColor: '#FDFBF7', border: `1px solid ${LINE}`, borderRadius: '10px', p: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                <TextField
                  label="Template name 模板名称"
                  size="small"
                  fullWidth
                  value={tplForm.name}
                  onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                />
                <TextField
                  label="Applies from 适用金额 ≥ $"
                  size="small"
                  type="number"
                  sx={{ width: 180 }}
                  value={tplForm.min_amount}
                  onChange={(e) => setTplForm({ ...tplForm, min_amount: e.target.value })}
                />
              </Box>
              <TextField
                label="Subject 邮件标题"
                size="small"
                fullWidth
                value={tplForm.subject}
                onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Body 正文"
                multiline
                minRows={7}
                fullWidth
                size="small"
                value={tplForm.body}
                onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
                <Button size="small" onClick={() => setTplForm(null)} disabled={tplSaving} sx={{ textTransform: 'none', color: MUTED }}>
                  Cancel 取消
                </Button>
                <Button
                  size="small"
                  onClick={handleSaveTemplate}
                  disabled={tplSaving || !tplForm.name || !tplForm.subject || !tplForm.body}
                  sx={{ ...pillButtonSx(true), fontSize: '0.71875rem', py: 0.375 }}
                >
                  {tplSaving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : 'Save 保存'}
                </Button>
              </Box>
            </Box>
          ) : (
            <Button
              fullWidth
              onClick={() => setTplForm({ name: '', min_amount: 0, subject: '', body: '' })}
              sx={{ mt: 2, textTransform: 'none', fontWeight: 700, fontSize: '0.78125rem', border: `1.5px dashed ${ORANGE}`, color: ORANGE, borderRadius: '10px', py: 1 }}
            >
              ＋ Add template 添加模板
            </Button>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTemplatesOpen(false)}>Close 关闭</Button>
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
