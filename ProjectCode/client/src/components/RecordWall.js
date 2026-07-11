/**
 * RecordWall — the profile "marathon record wall".
 *
 * Personal records hang as medal plaques (member's own race photo behind
 * each). Poster Mode frames the wall as one shareable image: save as PNG,
 * print, hang it on a real wall.
 */
import { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import {
  Add as AddIcon,
  CameraAlt as CameraIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
  Wallpaper as WallpaperIcon,
} from '@mui/icons-material';
import html2canvas from 'html2canvas';

const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';
const GOLD = '#D4A017';
const GREEN = '#2e7d32';
const GREEN_BG = '#eaf5ea';
const BLUE = '#1a63d0';
const BLUE_BG = '#e8f0fe';

// Order wall plaques longest distance first ("M" = miles in this dataset)
export function distanceToMeters(distance) {
  if (!distance) return 0;
  const d = distance.trim();
  const lower = d.toLowerCase();
  if (lower.includes('half')) return 21097.5;
  if (lower.includes('marathon')) return 42195;
  const mileShort = d.match(/^(\d+\.?\d*)\s*(m|mi|mile|miles)$/i);
  if (mileShort) return parseFloat(mileShort[1]) * 1609.34;
  const km = d.match(/^(\d+\.?\d*)\s*(k|km)$/i);
  if (km) return parseFloat(km[1]) * 1000;
  const num = parseFloat(d);
  return isNaN(num) ? 0 : num * 1000;
}

const DISTANCE_CN = {
  'Marathon': '全程马拉松',
  'Half Marathon': '半程马拉松',
};

// Source chip on each plaque
const SourceChip = ({ entry }) => {
  if (entry.pending) {
    return (
      <Chip
        label="⧗ Pending Review 待审核"
        size="small"
        sx={{
          backgroundColor: ORANGE_BG, color: ORANGE_DARK, fontWeight: 700,
          fontSize: '0.65rem', height: 20, border: `1px dashed ${ORANGE}`, borderRadius: '99px',
        }}
      />
    );
  }
  if (entry.onLeaderboard) {
    return (
      <Chip
        label="✓ On Leaderboard 已上榜"
        size="small"
        sx={{
          backgroundColor: GREEN_BG, color: GREEN, fontWeight: 700,
          fontSize: '0.65rem', height: 20, borderRadius: '99px',
        }}
      />
    );
  }
  return (
    <Chip
      label="NYRR Synced"
      size="small"
      sx={{
        backgroundColor: BLUE_BG, color: BLUE, fontWeight: 700,
        fontSize: '0.65rem', height: 20, borderRadius: '99px',
      }}
    />
  );
};

// One medal plaque hanging on the wall
const MedalPlaque = ({ entry, featured, posterMode, onChangePhoto }) => (
  <Box
    data-testid="medal-plaque"
    sx={{
      position: 'relative',
      backgroundColor: 'white',
      border: entry.pending ? `1.5px dashed ${ORANGE}` : `1px solid ${LINE}`,
      borderRadius: '14px',
      textAlign: 'center',
      pb: 2,
      overflow: 'hidden',
      boxShadow: '0 3px 8px rgba(0,0,0,0.08)',
      transition: 'all 0.25s ease',
      '&:hover': posterMode ? {} : {
        transform: 'translateY(-5px)',
        boxShadow: '0 12px 28px rgba(255,165,0,0.35)',
      },
      '&:hover .race-photo-cam': { opacity: 1 },
    }}
  >
    {/* photo from that race */}
    <Box
      sx={{
        height: 128,
        backgroundImage: entry.photoUrl ? `url("${entry.photoUrl}")` : 'none',
        backgroundColor: entry.photoUrl ? 'transparent' : ORANGE_BG,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderBottom: `2.5px solid ${ORANGE}`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!entry.photoUrl && !posterMode && (
        <Typography sx={{ fontSize: '0.75rem', color: ORANGE_DARK, fontWeight: 600, mt: 3 }}>
          📷 Add your race photo 添加照片
        </Typography>
      )}
      {!posterMode && (
        <Button
          className="race-photo-cam"
          size="small"
          startIcon={<CameraIcon sx={{ fontSize: 14 }} />}
          onClick={() => onChangePhoto(entry)}
          sx={{
            position: 'absolute', right: 8, bottom: 8,
            backgroundColor: 'rgba(0,0,0,0.6)', color: 'white',
            fontSize: '0.65rem', fontWeight: 600, textTransform: 'none',
            borderRadius: '99px', px: 1.25, py: 0.25, minWidth: 0,
            opacity: { xs: 1, md: 0 },
            transition: 'opacity 0.2s',
            '&:hover': { backgroundColor: 'rgba(0,0,0,0.75)' },
          }}
        >
          {entry.photoUrl ? 'Change 更换' : 'Add 添加'}
        </Button>
      )}
    </Box>

    {/* hanging ribbon */}
    <Box sx={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 54, height: 40, zIndex: 2 }}>
      <Box sx={{
        position: 'absolute', top: 0, left: 2, width: 20, height: 38,
        background: `linear-gradient(${ORANGE}, ${ORANGE_DARK})`,
        transform: 'skewX(-14deg)', borderRadius: '0 0 4px 4px',
      }} />
      <Box sx={{
        position: 'absolute', top: 0, right: 2, width: 20, height: 38,
        background: `linear-gradient(${ORANGE}, ${ORANGE_DARK})`,
        transform: 'skewX(14deg)', borderRadius: '0 0 4px 4px',
      }} />
    </Box>
    {/* medal disc */}
    <Box sx={{
      position: 'absolute', top: 26, left: '50%', transform: 'translateX(-50%)',
      width: 40, height: 40, borderRadius: '50%',
      background: featured
        ? 'radial-gradient(circle at 35% 30%, #ffd77a, #D4A017)'
        : entry.pending
          ? 'radial-gradient(circle at 35% 30%, #f2f2f2, #b9b9b9)'
          : 'radial-gradient(circle at 35% 30%, #ffd77a, #D4A017)',
      border: '2.5px solid white',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, zIndex: 3,
    }}>
      {featured ? '🏆' : entry.pending ? '⏱' : '🥇'}
    </Box>

    <Typography sx={{
      mt: 2, fontSize: '0.7rem', fontWeight: 700, letterSpacing: 2.5,
      color: MUTED, textTransform: 'uppercase',
    }}>
      {entry.distance}
    </Typography>
    <Typography sx={{ fontSize: '0.68rem', color: MUTED }}>
      {DISTANCE_CN[entry.distance] || ' '}
    </Typography>
    <Typography sx={{
      fontSize: featured ? '2.6rem' : '2.2rem', fontWeight: 800, lineHeight: 1.1,
      color: featured ? ORANGE_DARK : INK, fontVariantNumeric: 'tabular-nums', my: 0.5,
    }}>
      {entry.time}
    </Typography>
    <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: '#444', px: 1.5 }}>
      {entry.race}
    </Typography>
    <Typography sx={{ fontSize: '0.7rem', color: MUTED }}>
      {entry.date}{entry.pace ? ` · Pace ${entry.pace}` : ''}
    </Typography>
    <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap', px: 1 }}>
      <SourceChip entry={entry} />
    </Box>
  </Box>
);

const RecordWall = ({
  memberName,
  memberNameCn,
  totalRaces,
  prEntries,          // [{distance, time, race, date, pace, photoUrl, onLeaderboard, resultId}]
  pendingEntries,     // [{distance, time, race, date, pace, photoUrl, pending:true, submissionId}]
  onAddRecord,
  onChangePhoto,
}) => {
  const wallRef = useRef(null);
  const [posterMode, setPosterMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const sorted = [...prEntries].sort(
    (a, b) => distanceToMeters(b.distance) - distanceToMeters(a.distance)
  );
  const entries = [...sorted, ...pendingEntries];
  const featuredKey = sorted.length > 0 ? `${sorted[0].distance}|${sorted[0].time}` : null;

  const renderToCanvas = async () => {
    return html2canvas(wallRef.current, {
      useCORS: true,
      backgroundColor: '#FBF8F2',
      scale: 2,
    });
  };

  const handleSaveImage = async () => {
    setExporting(true);
    setExportError('');
    try {
      const canvas = await renderToCanvas();
      const link = document.createElement('a');
      link.download = 'newbee-record-wall.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setExportError('Failed to export image. Please try again. / 导出图片失败，请重试。');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    setExporting(true);
    setExportError('');
    try {
      const canvas = await renderToCanvas();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(
          `<img src="${canvas.toDataURL('image/png')}" style="max-width:100%" onload="window.print()" />`
        );
        printWindow.document.close();
      }
    } catch (err) {
      setExportError('Failed to prepare print view. Please try again. / 打印准备失败，请重试。');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box>
      {/* poster action bar */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <Button
          variant={posterMode ? 'contained' : 'outlined'}
          startIcon={<WallpaperIcon />}
          onClick={() => setPosterMode(!posterMode)}
          disableElevation
          sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: '99px',
            ...(posterMode
              ? { backgroundColor: ORANGE, '&:hover': { backgroundColor: ORANGE_DARK } }
              : { borderColor: ORANGE, color: ORANGE, '&:hover': { borderColor: ORANGE_DARK, backgroundColor: ORANGE_BG } }),
          }}
        >
          Poster Mode 海报模式
        </Button>
        <Button
          startIcon={exporting ? <CircularProgress size={14} /> : <DownloadIcon />}
          onClick={handleSaveImage}
          disabled={exporting || entries.length === 0}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '99px', color: ORANGE, '&:hover': { backgroundColor: ORANGE_BG } }}
        >
          Save as Image 保存图片
        </Button>
        <Button
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          disabled={exporting || entries.length === 0}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '99px', color: ORANGE, '&:hover': { backgroundColor: ORANGE_BG } }}
        >
          Print 打印
        </Button>
        <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
          One image — frame it or share it to WeChat Moments 一张图，装裱上墙或分享朋友圈
        </Typography>
      </Box>
      {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}

      {/* the wall (export target) */}
      <Box
        ref={wallRef}
        data-testid="record-wall"
        sx={{
          transition: 'all 0.3s ease',
          ...(posterMode && {
            border: '16px solid #1b1611',
            outline: `3px solid ${GOLD}`,
            outlineOffset: '-22px',
            borderRadius: '4px',
            p: { xs: 2.5, sm: 3.5 },
            backgroundColor: '#FBF8F2',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          }),
        }}
      >
        {posterMode && (
          <Box sx={{ textAlign: 'center', mb: 2.5 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: 4, color: INK }}>
              {memberName}
              {memberNameCn ? <Box component="span" sx={{ color: ORANGE_DARK }}> · {memberNameCn}</Box> : null}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: MUTED, letterSpacing: 2, mt: 0.5 }}>
              MY RECORD WALL 我的纪录墙 · {totalRaces} RACES · NEWBEE RUNNING CLUB
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            backgroundColor: '#FBF8F2',
            backgroundImage: 'radial-gradient(circle, #efe9dd 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            border: posterMode ? 'none' : `1px solid ${LINE}`,
            borderRadius: posterMode ? 0 : '16px',
            p: { xs: 2, sm: 3.5 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2.5,
          }}
        >
          {entries.length === 0 && (
            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 4 }}>
              <Typography sx={{ color: MUTED }}>
                Your wall is waiting for its first medal. / 你的纪录墙在等待第一块奖牌。
              </Typography>
            </Box>
          )}
          {entries.map((entry) => (
            <MedalPlaque
              key={entry.submissionId ? `sub-${entry.submissionId}` : `pr-${entry.distance}|${entry.time}`}
              entry={entry}
              featured={!entry.pending && `${entry.distance}|${entry.time}` === featuredKey}
              posterMode={posterMode}
              onChangePhoto={onChangePhoto}
            />
          ))}
          {!posterMode && (
            <Box
              data-testid="add-record-plaque"
              onClick={onAddRecord}
              sx={{
                border: '2px dashed #d9d0bf', borderRadius: '14px', minHeight: 300,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: MUTED,
                transition: 'all 0.2s',
                '&:hover': { borderColor: ORANGE, color: ORANGE },
              }}
            >
              <AddIcon sx={{ fontSize: 34, mb: 1 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Add a record 添加成绩
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', mt: 0.5, textAlign: 'center', px: 2 }}>
                Race outside NYRR? Create the race & submit for review
                <br />
                创建比赛并提交审核
              </Typography>
            </Box>
          )}
        </Box>

        {posterMode && (
          <Typography sx={{ textAlign: 'center', mt: 2.5, fontSize: '0.7rem', color: MUTED, letterSpacing: 2 }}>
            NEWBEERUNNINGCLUB.ORG · 纽蜂跑团
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default RecordWall;
