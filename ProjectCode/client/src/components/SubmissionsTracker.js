/**
 * SubmissionsTracker — "My Submissions" with a live 4-step progress tracker
 * per race-record submission:
 * Submitted → Committee Review → Approved → On Leaderboard.
 */
import { Box, Button, Chip, Link, Typography } from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';

const ORANGE = '#FFA500';
const ORANGE_BG = '#FFF6E8';
const ORANGE_DARK = '#F29400';
const LINE = '#EEE7DC';
const MUTED = '#757575';
const GREEN = '#2e7d32';
const GREEN_BG = '#eaf5ea';
const RED = '#c62828';
const RED_BG = '#fdecea';

const STEPS = [
  { en: 'Submitted', cn: '已提交' },
  { en: 'Committee Review', cn: '委员会审核' },
  { en: 'Approved', cn: '批准' },
  { en: 'On Leaderboard', cn: '上榜' },
];

// Step index reached per status (rejected stops at review)
function progressFor(status) {
  if (status === 'approved') return 4;
  if (status === 'rejected') return 2;
  return 1; // pending: submitted done, review in progress
}

const StepDot = ({ state, index }) => {
  const styles = {
    done: { borderColor: GREEN, backgroundColor: GREEN_BG, color: GREEN },
    now: { borderColor: ORANGE, backgroundColor: ORANGE_BG, color: ORANGE_DARK },
    rejected: { borderColor: RED, backgroundColor: RED_BG, color: RED },
    todo: { borderColor: '#ddd', backgroundColor: 'white', color: MUTED },
  }[state];
  return (
    <Box sx={{
      width: 26, height: 26, borderRadius: '50%', border: '2px solid',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
      ...styles,
    }}>
      {state === 'done' ? <CheckIcon sx={{ fontSize: 14 }} />
        : state === 'rejected' ? <CloseIcon sx={{ fontSize: 14 }} />
        : index + 1}
    </Box>
  );
};

const StatusChip = ({ status }) => {
  const config = {
    pending: { label: '⧗ In review 审核中', sx: { backgroundColor: ORANGE_BG, color: ORANGE_DARK, border: `1px dashed ${ORANGE}` } },
    approved: { label: '✓ On Leaderboard 已上榜', sx: { backgroundColor: GREEN_BG, color: GREEN } },
    rejected: { label: '✕ Rejected 已拒绝', sx: { backgroundColor: RED_BG, color: RED } },
  }[status] || { label: status, sx: {} };
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{ fontWeight: 700, fontSize: '0.68rem', height: 22, borderRadius: '99px', ...config.sx }}
    />
  );
};

const SubmissionCard = ({ submission, onEdit, onWithdraw }) => {
  const progress = progressFor(submission.status);
  const rejected = submission.status === 'rejected';

  return (
    <Box
      data-testid="submission-card"
      sx={{
        border: submission.status === 'pending' ? `1.5px dashed ${ORANGE}` : `1px solid ${LINE}`,
        backgroundColor: submission.status === 'pending' ? '#FFFDF8' : 'white',
        borderRadius: '12px', p: 2.5, mb: 2,
        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{submission.race_name}</Typography>
        <Typography sx={{ fontWeight: 700, color: ORANGE_DARK, fontVariantNumeric: 'tabular-nums' }}>
          {submission.finish_time}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
          {submission.race_distance} · {submission.race_date}
        </Typography>
        <StatusChip status={submission.status} />
        <Box sx={{ marginLeft: 'auto', display: 'flex', gap: 0.5 }}>
          {submission.status !== 'approved' && (
            <>
              <Button
                size="small"
                startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                onClick={() => onEdit(submission)}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', color: ORANGE, minWidth: 0 }}
              >
                {rejected ? 'Edit & resubmit 修改重交' : 'Edit 编辑'}
              </Button>
              <Button
                size="small"
                startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                onClick={() => onWithdraw(submission)}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', color: MUTED, minWidth: 0 }}
              >
                Withdraw 撤回
              </Button>
            </>
          )}
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: MUTED, mt: 0.5 }}>
        {submission.proof_url ? (
          <>
            Proof 证明:{' '}
            <Link href={submission.proof_url} target="_blank" rel="noopener noreferrer" sx={{ color: '#1a63d0' }}>
              official results ↗
            </Link>
          </>
        ) : (
          'No proof link attached 未附证明链接'
        )}
        {submission.status === 'approved' && ' · visible on the club Records page 🎉'}
      </Typography>
      {rejected && submission.review_note && (
        <Typography sx={{ fontSize: '0.78rem', color: RED, mt: 0.5 }}>
          Committee note 审核备注: {submission.review_note}
        </Typography>
      )}

      {/* 4-step tracker */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 2 }}>
        {STEPS.map((step, i) => {
          let state = 'todo';
          if (i < progress) state = 'done';
          if (submission.status === 'pending' && i === 1) state = 'now';
          if (rejected && i === 1) state = 'rejected';
          const barDone = i + 1 < progress;
          return (
            <Box key={step.en} sx={{ display: 'flex', alignItems: 'flex-start', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: 92, textAlign: 'center' }}>
                <StepDot state={state} index={i} />
                <Typography sx={{
                  fontSize: '0.62rem', lineHeight: 1.3,
                  fontWeight: state === 'now' ? 700 : 400,
                  color: state === 'done' ? GREEN : state === 'now' ? ORANGE_DARK : state === 'rejected' ? RED : MUTED,
                }}>
                  {rejected && i === 1 ? 'Rejected 已拒绝' : `${step.en} ${step.cn}`}
                </Typography>
              </Box>
              {i < STEPS.length - 1 && (
                <Box sx={{
                  flex: 1, height: '2.5px', mt: '12px', mx: -2,
                  backgroundColor: barDone ? GREEN : '#e8e2d5',
                }} />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const SubmissionsTracker = ({ submissions, onEdit, onWithdraw }) => {
  if (!submissions || submissions.length === 0) return null;
  return (
    <Box>
      {submissions.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          onEdit={onEdit}
          onWithdraw={onWithdraw}
        />
      ))}
    </Box>
  );
};

export default SubmissionsTracker;
