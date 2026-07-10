import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useEffect, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import {
  getClubRuleVersions,
  createClubRuleVersion,
  updateClubRuleVersion,
  deleteClubRuleVersion,
} from '../api/clubRules';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const MUTED = '#757575';

const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    ['clean']
  ],
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline',
  'list', 'bullet',
  'indent'
];

// The original 2025 rules, kept as fallback content when the API has no
// versions yet, and as the prefill for the first committee-created revision.
const FALLBACK_CONTENT = `
<p>为了鼓励更多跑友代表新蜂跑团参与 NYRR 官方赛事，展现团队风采、提升竞技表现，新蜂跑团获得了本次 4 个 NYRR Club Entry 名额。现根据跑团内部商议，公布名额申请与分配规则如下</p>
<h3>一、什么是 Club Entry？</h3>
<p>Club Entry 是 NYRR 面向注册俱乐部分配的官方参赛名额，通常适用于名额紧张、需抽签或成绩达标的热门赛事。该名额具有以下特点：</p>
<ul>
  <li>无需抽签、直接参赛</li>
  <li>需要由跑团统一提交报名信息</li>
  <li>属于跑团整体参赛配额的一部分</li>
</ul>
<p>因此，我们希望名额能优先分配给真正代表跑团参赛、有出勤和贡献的成员。</p>
<h3>二、基本原则</h3>
<ul>
  <li><strong>确保参赛，不浪费名额</strong><br/>报名即表示确认参赛计划，请勿临时退出或更改，以免资源浪费。</li>
  <li><strong>公开透明，兼顾多元考量</strong><br/>分配过程中将参考竞技成绩、活动参与度、历史获得情况等多维度指标，确保公平、公正。</li>
  <li><strong>鼓励轮换，优先未曾获名额者</strong><br/>我们希望通过合理轮换，让更多成员享受到 Club Entry 的参赛机会，增强团队凝聚力。</li>
</ul>
<h3>三、分配规则与说明</h3>
<p>每次比赛共分配 4 个 Club Entry 名额，将遵循如下机制进行遴选：</p>
<p>为让更多成员体验 Club Entry 参赛机会，我们将优先考虑过去 6 个月内未获得过此类名额的成员。</p>
<p><em>说明：如候选人近期虽有过一次 Club Entry，但同时在积分榜、活动参与方面仍表现突出（如连续为跑团争分、组织活动、承担义工等），可作为特殊情况纳入评估，但不宜连续获得多场 Club Entry。</em></p>
<ol>
  <li><strong>竞技积分维度</strong><br/>参考 2024 年新蜂 NYRR 年度积分榜成绩，综合个人年度出勤情况与名次表现，排序择优。<br/><em>说明：如有并列或状态变化，管理组保留一定调整空间，以保证出赛代表性。</em></li>
  <li><strong>活动参与维度</strong><br/>参考 Heylo 平台活动积分，包括平时参加跑团训练、担任啦啦队志愿者、协助组织活动等。<br/>新成员如表现积极，亦可优先考虑。</li>
  <li><strong>历史 Club Entry 获得记录</strong><br/>若候选人中有未曾获得 Club Entry 的成员，将优先考虑，鼓励更多跑友获得首次出赛机会。</li>
  <li><strong>新人参与年限建议</strong><br/>我们鼓励新成员积极参与跑团活动，但基于名额稀缺性及参赛责任感，建议 Club Entry 申请者至少有六个月以上的新蜂参与记录（训练、积分赛或志愿活动）<br/>"照顾新人"初衷是激励融入与参与。建议通过参加跑团活动、义工活动等方式加深参与感，并在次年进入 Club Entry 考量范围。</li>
</ol>
<h3>四、报名方式</h3>
<p>如有意申请本次名额，请于指定时间前发送以下信息至邮箱：<br/>newbeerunningclub@gmail.com</p>
<ul>
  <li>Legal Name（NYRR 注册姓名）</li>
  <li>NYRR 注册邮箱</li>
  <li>是否曾获得 Club Entry</li>
  <li>Heylo 昵称（便于核对活动积分）</li>
</ul>
<p>如有未入选成员，也可作为候补人选。若有放弃名额情况将自动递补。</p>
<h3>六、补充说明</h3>
<ul>
  <li>若报名人数不足，管理组有权灵活分配剩余名额，冷冻期不计入再内；</li>
  <li>获得名额后如有特殊原因需退出，请提前通知管理组，以便递补；</li>
  <li>跑团保留在特殊情况下的名额调配权（如成员受伤、活动异常等）。</li>
</ul>
<p><strong>新蜂跑团管理组</strong></p>
<h3>📊 Heylo 积分系统说明</h3>
<p>Heylo 积分由三部分组成：</p>
<ul>
  <li>参赛积分：参加 NYRR 及其他跑团成员参与的重要赛事（每次 1 分）</li>
  <li>义工积分：摄影、打卡、官方志愿者等（每次 1 分）</li>
  <li>活动积分：参与训练营、团跑、Long Run（每次 1 分）</li>
</ul>
<p>积分采用 滚动制（Rolling Base）：</p>
<ul>
  <li>最近 6 个月积分按 1:1 计入</li>
  <li>6~12 个月积分按 0.5:1 计入</li>
  <li>超过 12 个月则不计分</li>
</ul>
`;

const FALLBACK_VERSION = {
  id: 'fallback',
  year_label: '2025',
  title: '2025 年赛事规则',
  content: FALLBACK_CONTENT,
  is_current: true,
  updated_at: null,
};

const emptyForm = { year_label: '', title: '', content: '', is_current: true };

// One revision row: fold header + collapsible sanitized HTML body
function RevisionRow({ version, expanded, onToggle, adminModeEnabled, onEdit }) {
  return (
    <Box
      sx={{
        border: `1px solid ${LINE}`,
        borderRadius: '12px',
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        mb: 1.5,
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: { xs: 1.5, sm: 2.5 },
          py: 1.75,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
          '&:hover': { backgroundColor: ORANGE_BG },
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
          {version.title}
          <Box component="span" sx={{ ml: 1, fontWeight: 400, fontSize: '0.78rem', color: MUTED }}>
            Club Entry Rules · {version.year_label}
          </Box>
        </Typography>
        <Box
          sx={{
            backgroundColor: version.is_current ? ORANGE : ORANGE_BG,
            color: version.is_current ? 'white' : ORANGE,
            fontSize: '0.65625rem',
            fontWeight: 700,
            px: 1.25,
            py: 0.4,
            borderRadius: '99px',
            whiteSpace: 'nowrap',
          }}
        >
          {version.is_current ? 'Current 现行' : 'Archived 存档'}
        </Box>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          {version.updated_at && (
            <Typography sx={{ fontSize: '0.75rem', color: MUTED, fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
              Updated {new Date(version.updated_at).toLocaleDateString()}
              {version.created_by ? ` · ${version.created_by}` : ''}
            </Typography>
          )}
          {adminModeEnabled && version.id !== 'fallback' && (
            <Tooltip title="Edit revision / 编辑版本">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onEdit(version); }}
                sx={{ color: ORANGE }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <KeyboardArrowDownIcon
            sx={{
              color: ORANGE,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
            }}
          />
        </Box>
      </Box>

      <Collapse in={expanded} timeout={350}>
        <Box
          sx={{
            px: { xs: 2, sm: 3 },
            pb: 3,
            pt: 1,
            borderTop: `1px solid ${LINE}`,
            fontSize: '0.90625rem',
            lineHeight: 1.75,
            color: '#3a3a3a',
            '& h1, & h2, & h3': { fontSize: '0.9375rem', fontWeight: 700, mt: 2.5, mb: 1, color: '#212121' },
            '& p': { mb: 1.25 },
            '& ul, & ol': { pl: 3.5, mb: 1.5 },
            '& li': { mb: 0.75 },
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(version.content) }}
        />
      </Collapse>
    </Box>
  );
}

const ClubEntryRules = () => {
  const { currentUser } = useAuth();
  const { adminModeEnabled } = useAdmin();
  const [versions, setVersions] = useState([FALLBACK_VERSION]);
  const [expandedId, setExpandedId] = useState(FALLBACK_VERSION.id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState(null); // null = creating new
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });

  const loadVersions = () => {
    getClubRuleVersions()
      .then((data) => {
        if (data && data.length > 0) {
          setVersions(data);
          const current = data.find((v) => v.is_current) || data[0];
          setExpandedId(current.id);
        }
      })
      .catch(() => {
        // Keep fallback content on error
      });
  };

  useEffect(() => {
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateDialog = () => {
    const latest = versions[0];
    const nextYear = new Date().getFullYear().toString();
    setEditingVersion(null);
    setFormData({
      year_label: nextYear,
      title: `${nextYear} 年赛事规则`,
      // Prefill from the latest revision so committee can revise, not retype
      content: latest ? latest.content : '',
      is_current: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (version) => {
    setEditingVersion(version);
    setFormData({
      year_label: version.year_label,
      title: version.title,
      content: version.content,
      is_current: version.is_current,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      if (editingVersion) {
        await updateClubRuleVersion(editingVersion.id, formData, currentUser.uid);
      } else {
        await createClubRuleVersion(formData, currentUser.uid);
      }
      setDialogOpen(false);
      setSnackbar({ open: true, message: 'Rules saved / 规则已保存', severity: 'success' });
      loadVersions();
    } catch (err) {
      console.error('Error saving rule version:', err);
      setSnackbar({ open: true, message: 'Failed to save rules / 保存规则失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser || !editingVersion) return;
    if (!window.confirm(`Delete "${editingVersion.title}"? / 确认删除该版本？`)) return;
    setSaving(true);
    try {
      await deleteClubRuleVersion(editingVersion.id, currentUser.uid);
      setDialogOpen(false);
      setSnackbar({ open: true, message: 'Revision deleted / 版本已删除', severity: 'success' });
      setVersions([FALLBACK_VERSION]);
      setExpandedId(FALLBACK_VERSION.id);
      loadVersions();
    } catch (err) {
      console.error('Error deleting rule version:', err);
      setSnackbar({ open: true, message: 'Failed to delete / 删除失败', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 2 }, mt: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
          Club Entry Rules
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: MUTED }}>
          俱乐部积分规则
        </Typography>
        {adminModeEnabled && (
          <Button
            onClick={openCreateDialog}
            startIcon={<AddIcon />}
            sx={{
              ml: 'auto',
              textTransform: 'none',
              color: ORANGE,
              fontWeight: 700,
              fontSize: '0.8125rem',
              border: `1.5px dashed ${ORANGE}`,
              borderRadius: '99px',
              px: 2,
              '&:hover': { backgroundColor: ORANGE_BG },
            }}
          >
            New Revision 新版本
          </Button>
        )}
      </Box>

      {/* Revision accordions, current first */}
      {versions.map((version) => (
        <RevisionRow
          key={version.id}
          version={version}
          expanded={expandedId === version.id}
          onToggle={() => setExpandedId(expandedId === version.id ? null : version.id)}
          adminModeEnabled={adminModeEnabled}
          onEdit={openEditDialog}
        />
      ))}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ color: ORANGE, fontWeight: 600 }}>
          {editingVersion ? 'Edit Revision / 编辑版本' : 'New Revision / 新版本'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Year / 年份"
                value={formData.year_label}
                onChange={(e) => setFormData({ ...formData, year_label: e.target.value })}
                sx={{ width: 140 }}
                required
              />
              <TextField
                fullWidth
                label="Title / 标题"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_current}
                  onChange={(e) => setFormData({ ...formData, is_current: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: ORANGE },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: ORANGE },
                  }}
                />
              }
              label="Current version / 设为现行版本（旧版本自动存档）"
            />
            <Box sx={{ '.ql-container': { minHeight: '260px' } }}>
              <ReactQuill
                theme="snow"
                value={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
                modules={quillModules}
                formats={quillFormats}
                placeholder="Enter club entry rules here... / 在此输入规则内容"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {editingVersion && (
            <Button
              onClick={handleDelete}
              disabled={saving}
              startIcon={<DeleteIcon />}
              color="error"
              sx={{ mr: 'auto', textTransform: 'none' }}
            >
              Delete / 删除
            </Button>
          )}
          <Button onClick={() => setDialogOpen(false)} disabled={saving} sx={{ textTransform: 'none', color: MUTED }}>
            Cancel / 取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !formData.year_label || !formData.title || !formData.content}
            sx={{
              textTransform: 'none',
              backgroundColor: ORANGE,
              borderRadius: '99px',
              fontWeight: 600,
              px: 3,
              '&:hover': { backgroundColor: ORANGE_DARK },
            }}
          >
            {saving ? <CircularProgress size={22} /> : 'Save / 保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ClubEntryRules;
