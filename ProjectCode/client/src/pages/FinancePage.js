import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container, Paper, Typography,
} from '@mui/material';
import { useAuth, useAdmin } from '../context';
import IncomeGrid from '../components/finance/IncomeGrid';
import ExpensesGrid from '../components/finance/ExpensesGrid';
import ReportsTab from '../components/finance/ReportsTab';
import DirectoryTab from '../components/finance/DirectoryTab';
import FinanceSettingsTab from '../components/finance/FinanceSettingsTab';
import { getAckQueue, sendAcks, importBankCsv } from '../api/finance';
import { runGmailSync } from '../api/donors';

// Design tokens (homepage design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const MUTED = '#757575';
const GREEN = '#2e7d32';

const TABS = [
  { key: 'income', label: '💵 Income 收入' },
  { key: 'expenses', label: '💸 Expenses 支出' },
  { key: 'reports', label: '🧾 Reports 报表' },
  { key: 'directory', label: '👥 Directory 通讯录' },
  { key: 'settings', label: '⚙️ Settings' },
];

const ghostButtonSx = {
  textTransform: 'none',
  fontWeight: 700,
  fontSize: '0.71875rem',
  borderRadius: '99px',
  px: 2,
  boxShadow: 'none',
  border: `1.5px solid ${ORANGE}`,
  color: ORANGE,
  backgroundColor: 'white',
  '&:hover': { backgroundColor: ORANGE, color: 'white', boxShadow: 'none' },
};

export default function FinancePage() {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const firebaseUid = currentUser?.uid;

  const [tab, setTab] = useState('income');
  const [ackQueue, setAckQueue] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState(null); // { severity, text }
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  const fetchAckQueue = useCallback(async () => {
    if (!firebaseUid || !adminModeEnabled) return;
    try {
      setAckQueue(await getAckQueue(firebaseUid));
    } catch (err) {
      console.error('Error loading ack queue:', err);
    }
  }, [firebaseUid, adminModeEnabled]);

  useEffect(() => {
    fetchAckQueue();
  }, [fetchAckQueue, refreshKey]);

  const handleScanGmail = async () => {
    setScanning(true);
    setNotice(null);
    try {
      await runGmailSync(firebaseUid);
      setNotice({ severity: 'success', text: 'Gmail scan finished. / 邮件扫描完成。' });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Error scanning Gmail:', err);
      setNotice({ severity: 'error', text: 'Gmail scan failed. Check server Gmail credentials. / 邮件扫描失败。' });
    } finally {
      setScanning(false);
    }
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsText(file);
      });
      const result = await importBankCsv(text, firebaseUid);
      setNotice({
        severity: 'success',
        text: `Imported 已导入: ${result.expenses_added} expenses 支出 · ${result.income_added} income 收入 · `
          + `${result.duplicates} duplicates skipped 重复跳过 · ${result.skipped_gmail_synced} already synced 已同步。`,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Error importing CSV:', err);
      setNotice({ severity: 'error', text: 'CSV import failed. / 账单导入失败。' });
    } finally {
      setImporting(false);
    }
  };

  const handleSendAcks = async () => {
    setSending(true);
    setNotice(null);
    try {
      const result = await sendAcks(undefined, firebaseUid);
      setNotice({
        severity: 'success',
        text: `Acknowledgments 致谢: ${result.sent} sent 已发送 · ${result.skipped} skipped (no email) 跳过（无邮箱）。`,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Error sending acks:', err);
      setNotice({ severity: 'error', text: 'Failed to send acknowledgments. / 发送致谢失败。' });
    } finally {
      setSending(false);
    }
  };

  if (!adminModeEnabled) {
    return (
      <Container maxWidth="md" sx={{ mt: 6 }}>
        <Paper elevation={0} sx={{
          border: `1px dashed ${ORANGE}`, backgroundColor: ORANGE_BG,
          borderRadius: '12px', p: 4, textAlign: 'center',
        }}>
          <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, mb: 1 }}>
            🔒 Admin mode required 需要管理员模式
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: MUTED }}>
            The finance workbench is for committee members. Enable admin mode from your account menu to continue.
            财务工作台仅限委员会成员使用，请在账户菜单中开启管理员模式。
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4 }}>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 0.5 }}>
        📚 Finance 财务工作台
      </Typography>
      <Typography sx={{ fontSize: '0.78125rem', color: MUTED, mb: 2 }}>
        Books grid — classify income & expenses, send acknowledgments, run the reports.
        电子账本：分类收支、群发致谢、生成报表。
      </Typography>

      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 1.5 }}>
          {notice.text}
        </Alert>
      )}

      {/* Sheet tabs + toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, flexWrap: 'wrap', mb: 0 }}>
        <Box sx={{ display: 'flex', gap: '2px' }}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Box
                key={t.key}
                onClick={() => setTab(t.key)}
                role="tab"
                aria-selected={on}
                sx={{
                  backgroundColor: on ? 'white' : '#EFEBE2',
                  border: `1px solid ${on ? ORANGE : LINE}`,
                  borderBottom: 'none',
                  borderRadius: '8px 8px 0 0',
                  px: 2.25,
                  py: 1,
                  fontSize: '0.78125rem',
                  fontWeight: 700,
                  color: on ? ORANGE_DARK : MUTED,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </Box>
            );
          })}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'flex', gap: 1, pb: 0.75, flexWrap: 'wrap' }}>
          <Button size="small" onClick={handleScanGmail} disabled={scanning} sx={ghostButtonSx}>
            {scanning ? <CircularProgress size={14} sx={{ color: ORANGE }} /> : '↻ Scan Gmail 扫描邮件'}
          </Button>
          <Button size="small" onClick={() => fileInputRef.current?.click()} disabled={importing} sx={ghostButtonSx}>
            {importing ? <CircularProgress size={14} sx={{ color: ORANGE }} /> : '⬆ Import Chase CSV 导入账单'}
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            ref={fileInputRef}
            onChange={handleFileSelected}
            data-testid="chase-csv-input"
          />
          <Button
            size="small"
            onClick={handleSendAcks}
            disabled={sending || ackQueue.length === 0}
            sx={{
              textTransform: 'none', fontWeight: 700, fontSize: '0.71875rem',
              borderRadius: '99px', px: 2, boxShadow: 'none',
              color: 'white', backgroundColor: GREEN,
              '&:hover': { backgroundColor: '#1e5c22', boxShadow: 'none' },
              '&.Mui-disabled': { backgroundColor: '#c8dcc9', color: 'white' },
            }}
          >
            {sending
              ? <CircularProgress size={14} sx={{ color: 'white' }} />
              : `✉ Send ${ackQueue.length} acks 群发致谢`}
          </Button>
        </Box>
      </Box>

      {/* Active worksheet */}
      <Box sx={{ pt: 0 }}>
        {tab === 'income' && <IncomeGrid refreshKey={refreshKey} onChanged={fetchAckQueue} />}
        {tab === 'expenses' && <ExpensesGrid refreshKey={refreshKey} />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'directory' && <DirectoryTab />}
        {tab === 'settings' && <FinanceSettingsTab />}
      </Box>
    </Container>
  );
}
