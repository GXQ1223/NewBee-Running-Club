import { useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CommitteeMemberCard from './CommitteeMemberCard';

// Design tokens (match HomePage / NavBar design language)
const ORANGE = '#FFA500';
const ORANGE_BG = '#FFF6E8';
const LINE = '#EEE7DC';
const MUTED = '#757575';

// One term on the timeline: a fold-out card with an avatar preview in the header.
function TermNode({ term, defaultExpanded, onImageClick }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={{ position: 'relative', mb: 2.25 }}>
      {/* Timeline dot */}
      <Box
        sx={{
          position: 'absolute',
          left: -30,
          top: 16,
          width: 13,
          height: 13,
          borderRadius: '50%',
          backgroundColor: term.current ? ORANGE : 'white',
          border: `3.5px solid ${ORANGE}`,
          boxShadow: term.current ? '0 0 0 5px rgba(255,165,0,0.18)' : 'none',
        }}
      />

      <Box
        sx={{
          border: `1px solid ${LINE}`,
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        {/* Fold header */}
        <Box
          onClick={() => setExpanded(prev => !prev)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 1.5, sm: 2.25 },
            py: 1.75,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color 0.15s ease',
            '&:hover': { backgroundColor: ORANGE_BG },
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', whiteSpace: 'nowrap' }}>
            {term.label}
            <Box component="span" sx={{ ml: 1, fontWeight: 400, fontSize: '0.75rem', color: MUTED }}>
              {term.label_cn}
            </Box>
          </Typography>
          <Box
            sx={{
              backgroundColor: term.current ? ORANGE : ORANGE_BG,
              color: term.current ? 'white' : ORANGE,
              fontSize: '0.65625rem',
              fontWeight: 700,
              px: 1.25,
              py: 0.4,
              borderRadius: '99px',
              whiteSpace: 'nowrap',
            }}
          >
            {term.current ? 'Current 现任' : 'Past 往届'}
          </Box>

          {/* Avatar preview */}
          <Box sx={{ display: 'flex', ml: 'auto' }}>
            {term.members.slice(0, 4).map((member) => (
              <Box
                key={member.id}
                component="img"
                src={member.image}
                alt={member.name}
                loading="lazy"
                onError={(e) => { e.target.style.display = 'none'; }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid white',
                  ml: '-9px',
                  display: { xs: 'none', sm: 'block' },
                }}
              />
            ))}
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {term.members.length} members
          </Typography>
          <KeyboardArrowDownIcon
            sx={{
              color: ORANGE,
              fontSize: '1.25rem',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease',
            }}
          />
        </Box>

        {/* Member grid */}
        <Collapse in={expanded} timeout={350}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(4, 1fr)',
                lg: 'repeat(5, 1fr)',
              },
              gap: 1.75,
              px: { xs: 1.5, sm: 2.25 },
              pb: 2.25,
              pt: 0.5,
            }}
          >
            {term.members.map((member) => (
              <CommitteeMemberCard key={member.id} member={member} onImageClick={onImageClick} />
            ))}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}

/**
 * Vertical timeline of committee terms. The current term renders expanded;
 * past terms render as collapsed one-line rows that expand inline.
 * Terms come from src/data/committeeMembers.js (committeeTerms) — adding a
 * new term there automatically adds a node here.
 */
export default function CommitteeTimeline({ terms, onImageClick }) {
  return (
    <Box sx={{ position: 'relative', pl: '34px' }}>
      {/* Timeline rail */}
      <Box
        sx={{
          position: 'absolute',
          left: '11px',
          top: '8px',
          bottom: '8px',
          width: '3px',
          borderRadius: '2px',
          background: `linear-gradient(to bottom, ${ORANGE}, #FFD9A0)`,
        }}
      />
      {terms.map((term) => (
        <TermNode
          key={term.id}
          term={term}
          defaultExpanded={!!term.current}
          onImageClick={onImageClick}
        />
      ))}
    </Box>
  );
}
