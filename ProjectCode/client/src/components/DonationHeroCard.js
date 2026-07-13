import { Box, Button, Typography } from '@mui/material';
import { useRef, useState } from 'react';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_DARK = '#F29400';
const LINE = '#EEE7DC';
const INK = '#212121';
const MUTED = '#757575';
const GREEN = '#2e7d32';
const ZELLE = '#6d1ed4';
const VENMO = '#008CFF';

const ZELLE_EMAIL = 'newbeerunningclub@gmail.com';
const VENMO_HANDLE = '@NewBee-Running';
const VENMO_URL = 'https://venmo.com/u/NewBee-Running';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      sx={{
        ml: 'auto',
        minWidth: 'unset',
        border: 'none',
        backgroundColor: copied ? GREEN : ORANGE,
        color: 'white',
        fontSize: '0.6875rem',
        fontWeight: 700,
        px: 1.75,
        py: 0.5,
        borderRadius: '99px',
        textTransform: 'none',
        whiteSpace: 'nowrap',
        boxShadow: 'none',
        '&:hover': { backgroundColor: copied ? GREEN : ORANGE_DARK, boxShadow: 'none' }
      }}
    >
      {copied ? '✓ Copied 已复制' : 'Copy 复制'}
    </Button>
  );
}

function MethodBadge({ color, label }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
      <Box sx={{ width: 12, height: 12, borderRadius: '4px', backgroundColor: color }} />
      <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 700, color: INK }}>
        {label}
      </Typography>
    </Box>
  );
}

function Handle({ text }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: '#F7F5F0',
        border: `1px solid ${LINE}`,
        borderRadius: '9px',
        px: 1.5,
        py: 1,
        my: 1
      }}
    >
      <Typography sx={{ fontSize: '0.84375rem', fontWeight: 600, color: INK, wordBreak: 'break-all' }}>
        {text}
      </Typography>
      <CopyButton text={text} />
    </Box>
  );
}

export default function DonationHeroCard() {
  return (
    <Box
      sx={{
        border: `2px solid ${ORANGE}`,
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(255,165,0,0.18)',
        backgroundColor: 'white'
      }}
    >
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg, #FFF6E8, #fff)', px: { xs: 2, sm: 3.5 }, pt: 2, pb: 1.75, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: INK }}>
          ❤️ Support NewBee{' '}
          <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: ORANGE_DARK }}>
            支持新蜂跑团
          </Typography>
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: MUTED, mt: 0.75, lineHeight: 1.6 }}>
          Every gift—large or small—funds our races, events, and community. 每一份捐赠都将用于赛事与社区活动。
        </Typography>
      </Box>

      {/* Payment methods: Zelle | Venmo */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          borderTop: `1px solid ${LINE}`
        }}
      >
        <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', gap: 2.5, alignItems: 'center' }}>
          <Box
            component="img"
            src="/images/zelle-qr.png"
            alt="Zelle QR code for NewBee Running Inc."
            sx={{
              width: 132,
              height: 132,
              border: `1px solid ${LINE}`,
              borderRadius: '12px',
              p: 0.75,
              backgroundColor: 'white',
              flexShrink: 0
            }}
          />
          <Box sx={{ flex: 1 }}>
            <MethodBadge color={ZELLE} label="Zelle" />
            <Typography sx={{ fontSize: '0.71875rem', color: MUTED, lineHeight: 1.7 }}>
              Scan in your banking app, or send to: 银行 App 内扫码，或转给：
            </Typography>
            <Handle text={ZELLE_EMAIL} />
            <Typography sx={{ fontSize: '0.71875rem', color: MUTED, lineHeight: 1.7 }}>
              Memo 备注: <b>Donation + your name 捐款+姓名</b> — helps us thank you! 方便我们致谢
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            display: 'flex',
            gap: 2.5,
            alignItems: 'center',
            borderLeft: { xs: 'none', md: `1px solid ${LINE}` },
            borderTop: { xs: `1px solid ${LINE}`, md: 'none' }
          }}
        >
          <Box
            component="img"
            src="/images/venmo-qr.png"
            alt="Venmo QR code for @NewBee-Running"
            sx={{
              width: 132,
              height: 132,
              border: `1px solid ${LINE}`,
              borderRadius: '12px',
              p: 0.75,
              backgroundColor: 'white',
              flexShrink: 0
            }}
          />
          <Box sx={{ flex: 1 }}>
            <MethodBadge color={VENMO} label="Venmo" />
            <Typography sx={{ fontSize: '0.71875rem', color: MUTED, lineHeight: 1.7 }}>
              Scan, or send to 扫码，或转给：
            </Typography>
            <Handle text={VENMO_HANDLE} />
            <Button
              component="a"
              href={VENMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                mt: 0.5,
                border: `1.5px solid ${VENMO}`,
                color: VENMO,
                fontSize: '0.75rem',
                fontWeight: 700,
                px: 2,
                py: 0.625,
                borderRadius: '99px',
                textTransform: 'none',
                '&:hover': { backgroundColor: VENMO, color: 'white' }
              }}
            >
              Open in Venmo 打开 Venmo →
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box sx={{ backgroundColor: '#FDFBF7', borderTop: `1px solid ${LINE}`, px: { xs: 2, sm: 3.5 }, py: 1.25, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.71875rem', color: MUTED }}>
          作为纽约注册的非营利组织，新蜂跑团将于年底统一向所有捐赠者发送 Donation Acknowledgement
          Letter。如果你希望提前收到，请在备注说明，也欢迎随时通过 newbeerunningclub@gmail.com
          与我们联系，我们将很乐意为您提前准备。
        </Typography>
      </Box>
    </Box>
  );
}
