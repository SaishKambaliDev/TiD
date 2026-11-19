import { DateTime } from 'luxon';

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  return DateTime.now().setZone(tz).isValid;
}

export function getLocalDateString(timezone: string, now = new Date()): string {
  const dt = DateTime.fromJSDate(now, { zone: timezone });
  return dt.isValid ? dt.toISODate()! : DateTime.utc().toISODate()!;
}

export function getPreviousDateString(localDate: string): string {
  return DateTime.fromISO(localDate).minus({ days: 1 }).toISODate()!;
}

export function getNextDateString(localDate: string): string {
  return DateTime.fromISO(localDate).plus({ days: 1 }).toISODate()!;
}

export function getIsoWeekday(localDate: string, timezone = 'UTC'): number {
  const dt = DateTime.fromISO(localDate, { zone: timezone });
  return dt.weekday; // 1 (Mon) .. 7 (Sun)
}

export function getCurrentMinuteOfDay(timezone: string, now = new Date()): number {
  const dt = DateTime.fromJSDate(now, { zone: timezone });
  if (!dt.isValid) return 0;
  return dt.hour * 60 + dt.minute;
}

export function parseHHMM(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return 0;
  const h = Math.min(24, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  if (h === 24 && m > 0) return 1440;
  return h * 60 + m;
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface MinuteInterval {
  start: number; // inclusive 0..1440
  end: number; // exclusive 0..1440
}

/**
 * Splits a potentially cross-midnight window (start > end) into [start, 1440] on start day
 * and [0, end] on the following day.
 */
export function expandWindowForDay(
  startTime: string,
  endTime: string,
  belongsTo: 'today' | 'yesterday_spillover'
): MinuteInterval | null {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  if (s === e) return null;

  if (s < e) {
    // Normal same-day window
    return belongsTo === 'today' ? { start: s, end: e } : null;
  }

  // Crosses midnight (e.g., 23:00 -> 07:00)
  if (belongsTo === 'today') {
    return s < 1440 ? { start: s, end: 1440 } : null;
  }
  return e > 0 ? { start: 0, end: e } : null;
}

export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({
      start: Math.max(0, i.start),
      end: Math.min(1440, i.end),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (sorted.length === 0) return [];
  const merged: MinuteInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function subtractIntervals(
  base: MinuteInterval[],
  blocked: MinuteInterval[]
): MinuteInterval[] {
  const mergedBase = mergeIntervals(base);
  const mergedBlocked = mergeIntervals(blocked);
  const result: MinuteInterval[] = [];

  for (const b of mergedBase) {
    let cursor = b.start;
    for (const blk of mergedBlocked) {
      if (blk.end <= cursor) continue;
      if (blk.start >= b.end) break;
      if (blk.start > cursor) {
        result.push({ start: cursor, end: Math.min(b.end, blk.start) });
      }
      cursor = Math.max(cursor, blk.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) {
      result.push({ start: cursor, end: b.end });
    }
  }

  return result;
}

export function intersectIntervals(
  aList: MinuteInterval[],
  bList: MinuteInterval[]
): MinuteInterval[] {
  const a = mergeIntervals(aList);
  const b = mergeIntervals(bList);
  const out: MinuteInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) out.push({ start, end });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return out;
}

export function sumIntervalMinutes(intervals: MinuteInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (acc, i) => acc + (i.end - i.start),
    0
  );
}
