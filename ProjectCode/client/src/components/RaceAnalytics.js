/**
 * RaceAnalytics — personal race-history visualizations for the profile page.
 *
 * Four panels, all computed from the member's own results except the club
 * distribution, which comes from GET /api/results/distribution:
 *   1. PB Progression — yearly best per distance, straight line, PBs marked
 *   2. Pace Timeline  — every race as a dot on a date × pace scatter with
 *      lollipop stems, a dotted connector, pace labels, and a distance
 *      filter that dims the other distances to 30%
 *   4. Year in Review — per-year tiles (races run, PRs set)
 *   5. Club Distribution — beeswarm of every club member's best time at a
 *      distance (slower on the left, faster on the right) with the member's
 *      own dot flagged
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { getResultsDistribution } from '../api/results';

const ACCENT = '#F58220';
const INK = '#212121';
const MUTED = '#757575';
const GRID = '#EDE6DA';

// ---------------------------------------------------------------- utilities

export function timeToSeconds(str) {
  if (str == null) return null;
  const parts = String(str).trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) return null;
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

export function secondsToTime(total) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const DISTANCE_ALIASES = {
  '1 mile': '1M', '1m': '1M', mile: '1M',
  '4 mile': '4M', '4m': '4M',
  '5k': '5K',
  '5 mile': '5M', '5m': '5M',
  '10k': '10K', '15k': '15K', '20k': '20K',
  '10 mile': '10M', '10m': '10M',
  '18 mile': '18M', '18m': '18M',
  'half marathon': 'Half', half: 'Half',
  marathon: 'Marathon',
};

export function normalizeDistance(raw) {
  if (!raw) return 'Other';
  const key = String(raw).trim().toLowerCase();
  return DISTANCE_ALIASES[key] || String(raw).trim();
}

export const DISTANCE_ORDER = ['1M', '5K', '4M', '5M', '10K', '15K', '10M', '18M', '20K', 'Half', 'Marathon'];

export const DISTANCE_MILES = {
  '1M': 1, '4M': 4, '5K': 3.10686, '5M': 5, '10K': 6.21371, '15K': 9.32057,
  '10M': 10, '18M': 18, '20K': 12.4274, Half: 13.1094, Marathon: 26.2188,
};

const DISTANCE_COLORS = {
  '1M': '#8E24AA', '5K': '#1E88E5', '4M': '#00ACC1', '5M': '#00897B',
  '10K': '#43A047', '15K': '#9E9D24', '10M': '#FB8C00', '18M': '#6D4C41',
  '20K': '#5E35B1', Half: '#F4511E', Marathon: '#C62828', Other: '#546E7A',
};

export function distanceColor(dist) {
  return DISTANCE_COLORS[dist] || '#546E7A';
}

function orderDistances(dists) {
  return [...dists].sort((a, b) => {
    const ia = DISTANCE_ORDER.indexOf(a);
    const ib = DISTANCE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** Enrich raw member results once: canonical distance, seconds, Date, year. */
function enrichResults(results) {
  return (results || [])
    .map((r) => {
      const dist = normalizeDistance(r.distance);
      const timeSec = timeToSeconds(r.overall_time);
      let paceSec = timeToSeconds(r.pace);
      if (paceSec == null && timeSec != null && DISTANCE_MILES[dist]) {
        paceSec = timeSec / DISTANCE_MILES[dist];
      }
      const date = r.race_date ? new Date(`${r.race_date}T12:00:00`) : null;
      return { ...r, dist, timeSec, paceSec, date, year: date ? date.getFullYear() : null };
    })
    .filter((r) => r.date && !Number.isNaN(r.date.getTime()) && r.timeSec != null);
}

function Panel({ title, cn, children }) {
  return (
    <Box sx={{ border: `1px solid ${GRID}`, borderRadius: 2, p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 700, color: INK }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>{cn}</Typography>
      </Box>
      {children}
    </Box>
  );
}

function DistanceChips({ distances, selected, onSelect, counts }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
      {distances.map((d) => (
        <Chip
          key={d}
          label={counts ? `${d} · ${counts[d]}` : d}
          size="small"
          onClick={() => onSelect(d)}
          sx={{
            fontWeight: 700,
            color: selected === d ? '#fff' : distanceColor(d),
            backgroundColor: selected === d ? distanceColor(d) : 'transparent',
            border: `1.5px solid ${distanceColor(d)}`,
          }}
        />
      ))}
    </Box>
  );
}

// ------------------------------------------------------- 1 · PB progression

function PbProgression({ races }) {
  const byDistance = useMemo(() => {
    const map = new Map();
    races.forEach((r) => {
      if (!map.has(r.dist)) map.set(r.dist, new Map());
      const years = map.get(r.dist);
      if (!years.has(r.year) || r.timeSec < years.get(r.year)) years.set(r.year, r.timeSec);
    });
    return map;
  }, [races]);

  const distances = useMemo(
    () => orderDistances([...byDistance.keys()].filter((d) => byDistance.get(d).size >= 1)),
    [byDistance],
  );
  const [selected, setSelected] = useState(null);
  const active = selected && byDistance.has(selected)
    ? selected
    : distances.find((d) => byDistance.get(d).size >= 2) || distances[0];

  if (!active) return null;
  const points = [...byDistance.get(active).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, sec], i, arr) => ({
      year,
      sec,
      isPb: arr.slice(0, i).every(([, s]) => sec < s),
    }));

  const W = 720; const H = 264; const L = 58; const R = 18; const T = 26; const B = 30;
  const secs = points.map((p) => p.sec);
  const lo = Math.min(...secs); const hi = Math.max(...secs);
  const pad = Math.max((hi - lo) * 0.25, 20);
  const y = (s) => T + ((s - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - T - B);
  const x = (i) => (points.length === 1 ? (L + W - R) / 2 : L + (i / (points.length - 1)) * (W - L - R));
  const ticks = [0, 1, 2, 3].map((i) => (lo - pad) + ((hi + pad) - (lo - pad)) * (i / 3));

  return (
    <Panel title="PB Progression" cn="最佳成绩进步 · yearly best, straight line — dots on the line are new PBs">
      <DistanceChips distances={distances} selected={active} onSelect={setSelected} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`PB progression for ${active}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{secondsToTime(t)}</text>
          </g>
        ))}
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.sec)}`).join(' ')}
          fill="none" stroke={distanceColor(active)} strokeWidth="2.5" strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={p.year}>
            <circle cx={x(i)} cy={y(p.sec)} r={p.isPb ? 6.5 : 5}
              fill={p.isPb ? distanceColor(active) : '#fff'}
              stroke={distanceColor(active)} strokeWidth="2.5" />
            <text x={x(i)} y={y(p.sec) - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>
              {secondsToTime(p.sec)}
            </text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{p.year}</text>
          </g>
        ))}
      </svg>
      <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>
        Best {active} in {points[points.length - 1].year}: {secondsToTime(points[points.length - 1].sec)}
        {points.some((p) => p.isPb && p.year === points[points.length - 1].year) ? ' — a current PB' : ''}
      </Typography>
    </Panel>
  );
}

// -------------------------------------------------------- 2 · pace timeline

function PaceTimeline({ races }) {
  const sorted = useMemo(() => [...races].filter((r) => r.paceSec != null).sort((a, b) => a.date - b.date), [races]);
  const distances = useMemo(() => orderDistances([...new Set(sorted.map((r) => r.dist))]), [sorted]);
  const [selected, setSelected] = useState(null);
  const [picked, setPicked] = useState(null);
  if (sorted.length === 0) return null;

  const W = 720; const H = 300; const L = 46; const R = 16; const T = 16; const B = 26;
  const t0 = sorted[0].date.getTime(); const t1 = sorted[sorted.length - 1].date.getTime();
  const span = Math.max(t1 - t0, 1);
  const paces = sorted.map((r) => r.paceSec);
  const pLo = Math.min(...paces); const pHi = Math.max(...paces);
  const pPad = Math.max((pHi - pLo) * 0.12, 10);
  const x = (d) => L + ((d.getTime() - t0) / span) * (W - L - R);
  const y = (p) => T + ((p - (pLo - pPad)) / ((pHi + pPad) - (pLo - pPad))) * (H - T - B);
  const curveSet = selected ? sorted.filter((r) => r.dist === selected) : sorted;
  const ticks = [0, 1, 2, 3].map((i) => (pLo - pPad) + ((pHi + pPad) - (pLo - pPad)) * (i / 3));

  return (
    <Panel title="All Races · Pace Timeline" cn="全部比赛 · 配速 — click a distance to isolate it, click a dot for the race">
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
        <Chip label="All" size="small" onClick={() => setSelected(null)}
          sx={{ fontWeight: 700, color: !selected ? '#fff' : INK, backgroundColor: !selected ? INK : 'transparent', border: `1.5px solid ${INK}` }} />
        {distances.map((d) => (
          <Chip key={d} label={d} size="small" onClick={() => setSelected(selected === d ? null : d)}
            sx={{ fontWeight: 700, color: selected === d ? '#fff' : distanceColor(d), backgroundColor: selected === d ? distanceColor(d) : 'transparent', border: `1.5px solid ${distanceColor(d)}` }} />
        ))}
      </Box>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Pace of every race over time">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{secondsToTime(t)}</text>
          </g>
        ))}
        <text x={L} y={T - 4} fontSize="10.5" fill={MUTED}>faster ↑</text>
        {distances.map((d) => (
          <g key={d} opacity={!selected || selected === d ? 1 : 0.3}>
            {sorted.filter((r) => r.dist === d).map((r, i) => (
              <g key={`${d}-${i}`}>
                <line x1={x(r.date)} x2={x(r.date)} y1={y(r.paceSec)} y2={H - B} stroke={distanceColor(d)} strokeWidth="1" opacity="0.45" />
                <text x={x(r.date)} y={y(r.paceSec) - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill={distanceColor(d)}>
                  {secondsToTime(r.paceSec)}
                </text>
                <circle cx={x(r.date)} cy={y(r.paceSec)} r="5" fill={distanceColor(d)} stroke="#fff" strokeWidth="1.5"
                  style={{ cursor: 'pointer' }} onClick={() => setPicked(r)}>
                  <title>{`${r.race_date} · ${r.race} · ${r.dist} · ${r.overall_time}`}</title>
                </circle>
              </g>
            ))}
          </g>
        ))}
        {curveSet.length > 1 && (
          <polyline
            points={curveSet.map((r) => `${x(r.date)},${y(r.paceSec)}`).join(' ')}
            fill="none" stroke={selected ? distanceColor(selected) : '#9E9E9E'}
            strokeWidth="1.8" strokeDasharray="2 4" pointerEvents="none"
          />
        )}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={GRID} />
        <text x={L} y={H - 6} fontSize="11" fill={MUTED}>{sorted[0].race_date}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill={MUTED}>{sorted[sorted.length - 1].race_date}</text>
      </svg>
      {picked && (
        <Typography sx={{ fontSize: '0.85rem', color: INK }}>
          {picked.race_date} · {picked.race} · {picked.dist} · <b>{picked.overall_time}</b> · {secondsToTime(picked.paceSec)}/mi
        </Typography>
      )}
    </Panel>
  );
}

// ------------------------------------------------------- 4 · year in review

function YearTiles({ races }) {
  const years = useMemo(() => {
    const byYear = new Map();
    races.forEach((r) => {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year).push(r);
    });
    const bestEver = new Map();
    const asc = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
    const computed = asc.map(([year, list]) => {
      const bests = new Map();
      list.forEach((r) => {
        if (!bests.has(r.dist) || r.timeSec < bests.get(r.dist)) bests.set(r.dist, r.timeSec);
      });
      const prs = [];
      bests.forEach((sec, dist) => {
        if (!bestEver.has(dist) || sec < bestEver.get(dist)) {
          prs.push({ dist, sec });
          bestEver.set(dist, sec);
        }
      });
      return { year, count: list.length, prs };
    });
    return computed.reverse();
  }, [races]);

  if (years.length === 0) return null;
  return (
    <Panel title="Year in Review" cn="年度回顾">
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {years.map(({ year, count, prs }) => (
          <Box key={year} sx={{ border: `1px solid ${GRID}`, borderRadius: 2, p: 1.75, minWidth: 180, flex: '1 1 180px' }}>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: INK }}>{year}</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: MUTED, mb: 1 }}>
              {count} races · {prs.length} PR{prs.length === 1 ? '' : 's'} set
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {prs.length === 0 && (
                <Typography sx={{ fontSize: '0.8rem', color: MUTED }}>No new PRs — a building year.</Typography>
              )}
              {prs.map((p) => (
                <Chip key={p.dist} size="small"
                  label={`${p.dist} ${secondsToTime(p.sec)}`}
                  sx={{ fontWeight: 700, color: distanceColor(p.dist), border: `1.5px solid ${distanceColor(p.dist)}`, backgroundColor: 'transparent' }} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

// --------------------------------------------------- 5 · club distribution

const SPECTRUM = [
  [0, [0, 178, 172]], [0.35, [86, 190, 90]], [0.55, [240, 200, 60]],
  [0.78, [245, 140, 50]], [1, [233, 90, 140]],
];

function spectrumColor(u) {
  const t = Math.min(1, Math.max(0, u));
  for (let i = 1; i < SPECTRUM.length; i++) {
    if (t <= SPECTRUM[i][0]) {
      const [t0, c0] = SPECTRUM[i - 1];
      const [t1, c1] = SPECTRUM[i];
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(233,90,140)';
}

/** Relaxed beeswarm: x fixed by time, y scattered then pushed apart. */
function layoutBeeswarm(entries, xOf, cy, halfH, r) {
  const minY = cy - halfH + r;
  const maxY = cy + halfH - r;
  const pts = entries.map((e, i) => {
    const rnd = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
    return { entry: e, x: xOf(e.seconds), y: cy + (rnd - 0.5) * 2 * halfH * 0.7 };
  });
  const needBase = 2 * r + 1.5;
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]; const b = pts[j];
        const dx = Math.abs(a.x - b.x);
        if (dx >= needBase) continue;
        const needDy = Math.sqrt(needBase * needBase - dx * dx);
        const dy = b.y - a.y;
        if (Math.abs(dy) < needDy) {
          const push = ((needDy - Math.abs(dy)) / 2) * (dy >= 0 ? 1 : -1);
          a.y -= push; b.y += push; moved = true;
        }
      }
    }
    pts.forEach((p) => { p.y = Math.min(maxY, Math.max(minY, p.y)); });
    if (!moved) break;
  }
  return pts;
}

function ClubDistribution({ races, memberName }) {
  const [rawDist, setRawDist] = useState(undefined); // undefined = loading
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (typeof getResultsDistribution !== 'function') throw new Error('unavailable');
        const data = await getResultsDistribution();
        if (live) setRawDist(data && data.distances ? data.distances : null);
      } catch {
        if (live) setRawDist(null);
      }
    })();
    return () => { live = false; };
  }, []);

  const pools = useMemo(() => {
    if (!rawDist) return null;
    const merged = new Map();
    Object.entries(rawDist).forEach(([rawKey, entries]) => {
      const dist = normalizeDistance(rawKey);
      if (!merged.has(dist)) merged.set(dist, new Map());
      const byName = merged.get(dist);
      (entries || []).forEach((e) => {
        const sec = typeof e.seconds === 'number' ? e.seconds : timeToSeconds(e.time);
        if (sec == null) return;
        const key = String(e.runner_name || '').toLowerCase();
        if (!byName.has(key) || sec < byName.get(key).seconds) {
          byName.set(key, { runner_name: e.runner_name, time: e.time, seconds: sec });
        }
      });
    });
    const out = new Map();
    merged.forEach((byName, dist) => {
      out.set(dist, [...byName.values()].sort((a, b) => a.seconds - b.seconds));
    });
    return out;
  }, [rawDist]);

  const myBest = useMemo(() => {
    const map = new Map();
    races.forEach((r) => {
      if (!map.has(r.dist) || r.timeSec < map.get(r.dist)) map.set(r.dist, r.timeSec);
    });
    return map;
  }, [races]);

  if (rawDist === undefined) return null;
  if (!pools || pools.size === 0) {
    return (
      <Panel title="Where You Stand in the Club" cn="俱乐部位置">
        <Typography sx={{ fontSize: '0.85rem', color: MUTED }}>Club distribution is unavailable right now.</Typography>
      </Panel>
    );
  }

  const preferred = ['5K', '10K', 'Half', 'Marathon'].filter((d) => pools.has(d));
  const rest = orderDistances([...pools.keys()].filter((d) => !preferred.includes(d)));
  const distances = [...preferred, ...rest];
  const active = selected && pools.has(selected) ? selected : (pools.has('Half') ? 'Half' : distances[0]);
  const entries = pools.get(active);
  const myName = (memberName || '').trim().toLowerCase();
  let youIdx = myName ? entries.findIndex((e) => String(e.runner_name).toLowerCase() === myName) : -1;
  if (youIdx === -1 && myBest.has(active)) {
    const target = Math.round(myBest.get(active));
    youIdx = entries.findIndex((e) => Math.round(e.seconds) === target);
  }
  const you = youIdx >= 0 ? entries[youIdx] : null;
  const n = entries.length;
  const median = entries[Math.floor(n / 2)].seconds;

  const W = 720; const H = 292; const L = 16; const R = 16; const T = 34; const B = 30;
  const plotW = W - L - R; const plotH = H - T - B;
  const sortedSecs = entries.map((e) => e.seconds);
  const tMin = sortedSecs[0];
  const p95 = sortedSecs[Math.min(n - 1, Math.floor(0.95 * (n - 1)))];
  const tMax = Math.max(p95 * 1.03, tMin + 60);
  const clampSec = (s) => Math.min(Math.max(s, tMin), tMax);
  // Flipped axis: slower on the left, faster on the right.
  const xOf = (s) => L + ((tMax - clampSec(s)) / (tMax - tMin)) * plotW;
  const pts = layoutBeeswarm(entries, xOf, T + plotH / 2, plotH / 2, 5.5);
  const youPt = you ? pts[youIdx] : null;
  const flag = you ? `YOU · ${secondsToTime(you.seconds)} · #${youIdx + 1} of ${n} · Top ${Math.max(1, Math.round(((youIdx + 1) / n) * 100))}%` : '';
  const flagW = flag.length * 6.8 + 18;
  const flagX = youPt ? Math.min(Math.max(youPt.x - flagW / 2, 4), W - flagW - 4) : 0;
  const flagAbove = youPt ? youPt.y - 58 > 2 : true;

  return (
    <Panel title="Where You Stand in the Club" cn="俱乐部位置 · one dot per member — their best time">
      <DistanceChips distances={distances} selected={active} onSelect={setSelected}
        counts={Object.fromEntries(distances.map((d) => [d, pools.get(d).length]))} />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Club distribution for ${active}`}>
        <text x={L} y={16} fontSize="11" fill={MUTED}>← slower</text>
        <text x={W - R} y={16} textAnchor="end" fontSize="11" fill={MUTED}>faster →</text>
        <line x1={xOf(median)} x2={xOf(median)} y1={T} y2={H - B} stroke="#9E9E9E" strokeDasharray="4 4" />
        <text x={xOf(median)} y={H - B + 16} textAnchor="middle" fontSize="10.5" fill={MUTED}>
          club median {secondsToTime(median)}
        </text>
        {pts.map((p, i) => (you && i === youIdx ? null : (
          <circle key={i} cx={p.x} cy={p.y} r="5.5"
            fill={spectrumColor((clampSec(p.entry.seconds) - tMin) / (tMax - tMin))} opacity="0.9">
            <title>{`${p.entry.runner_name} · ${secondsToTime(p.entry.seconds)}`}</title>
          </circle>
        )))}
        {youPt && (
          <g>
            <circle cx={youPt.x} cy={youPt.y} r="9" fill={ACCENT} stroke="#fff" strokeWidth="2.5" />
            <line x1={youPt.x} x2={youPt.x}
              y1={flagAbove ? youPt.y - 11 : youPt.y + 11}
              y2={flagAbove ? youPt.y - 30 : youPt.y + 30}
              stroke={ACCENT} strokeWidth="1.5" />
            <rect x={flagX} y={flagAbove ? youPt.y - 52 : youPt.y + 30} width={flagW} height="21" rx="10.5" fill={ACCENT} />
            <text x={flagX + flagW / 2} y={(flagAbove ? youPt.y - 52 : youPt.y + 30) + 14.5}
              textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff">{flag}</text>
          </g>
        )}
        <text x={L} y={H - 6} fontSize="11" fill={MUTED}>{secondsToTime(tMax)}+</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill={MUTED}>{secondsToTime(tMin)}</text>
      </svg>
      <Typography sx={{ fontSize: '0.85rem', color: INK }}>
        {you
          ? <>Your <b>{secondsToTime(you.seconds)}</b> sits <b>#{youIdx + 1} of {n}</b> club members · club best {secondsToTime(tMin)} · median {secondsToTime(median)}</>
          : <>Club best {secondsToTime(tMin)} · median {secondsToTime(median)} · {n} members with a recorded {active}</>}
      </Typography>
    </Panel>
  );
}

// ------------------------------------------------------------------ wrapper

export default function RaceAnalytics({ results, memberName }) {
  const races = useMemo(() => enrichResults(results), [results]);
  return (
    <Box>
      {races.length > 0 && (
        <>
          <PbProgression races={races} />
          <PaceTimeline races={races} />
          <YearTiles races={races} />
        </>
      )}
      <ClubDistribution races={races} memberName={memberName} />
    </Box>
  );
}
