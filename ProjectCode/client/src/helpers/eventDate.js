// Event date/time helpers shared by EventCard, CalendarPage, HomePage and
// HighlightsPage — previously each file kept its own identical copy.

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Parse an event date (YYYY-MM-DD) into { day, month } for the date bubble
export function parseBubbleDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return { day: d.getDate(), month: MONTHS[d.getMonth()] };
}

// Convert a stored display time ("8:00 AM", "18:30") to the HH:MM value a
// native <input type="time"> needs. Returns '' when unparseable so the
// picker starts empty instead of showing garbage.
export function to24Hour(timeStr) {
  if (!timeStr) return '';
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let hours = Number(m[1]);
  const minutes = m[2];
  const meridiem = m[3] ? m[3].toUpperCase() : null;
  if (hours > 23 || Number(minutes) > 59) return '';
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

// Convert an <input type="time"> value ("08:00") back to the 12-hour string
// the rest of the site displays ("8:00 AM").
export function to12Hour(timeStr) {
  if (!timeStr) return '';
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return timeStr;
  let hours = Number(m[1]);
  const minutes = m[2];
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
}
