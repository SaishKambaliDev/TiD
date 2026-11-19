import { DateTime } from 'luxon';
import type { TaskCategory } from '../shared/types';

export function getTodayLocalDate(timezone: string): string {
  const dt = DateTime.now().setZone(timezone || 'UTC');
  return dt.isValid ? dt.toISODate()! : DateTime.utc().toISODate()!;
}

export function shiftLocalDate(dateStr: string, deltaDays: number): string {
  return DateTime.fromISO(dateStr).plus({ days: deltaDays }).toISODate()!;
}

export function formatFriendlyDate(dateStr: string, timezone?: string): string {
  const dt = timezone
    ? DateTime.fromISO(dateStr, { zone: timezone })
    : DateTime.fromISO(dateStr);
  return dt.isValid ? dt.toFormat('cccc, LLL d, yyyy') : dateStr;
}

export function formatShortDeadline(
  iso: string | null,
  timezone = 'UTC'
): string {
  if (!iso) return 'No deadline';
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone);
  if (!dt.isValid) return 'No deadline';
  return dt.toFormat('LLL d · HH:mm');
}

export function getContextualGreeting(name: string, timezone: string): string {
  const hour = DateTime.now().setZone(timezone || 'UTC').hour;
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

export function formatDurationMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

export function formatCategoryLabel(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAttentionLabel(cls: string): string {
  if (cls === 'attention_intensive') return 'Attention-intensive';
  if (cls === 'background') return 'Background';
  return 'Partially attentive';
}

export function getCategoryPastelTheme(
  cat: TaskCategory,
  dark = false
): {
  bg: string;
  bar: string;
  accentText: string;
  emoji: string;
} {
  if (dark) {
    switch (cat) {
      case 'coding':
        return { bg: '#1A2C46', bar: '#3D6FB8', accentText: '#9FC6FF', emoji: '💻' };
      case 'writing':
        return { bg: '#15302F', bar: '#3C8F8A', accentText: '#8EE0DA', emoji: '✍️' };
      case 'studying':
      case 'research':
        return { bg: '#27203F', bar: '#7E62C7', accentText: '#C9B2FF', emoji: '📚' };
      case 'design':
        return { bg: '#322B16', bar: '#B99740', accentText: '#F5D98A', emoji: '🎨' };
      case 'meeting':
        return { bg: '#331D28', bar: '#B76A8F', accentText: '#FFB8D3', emoji: '💬' };
      case 'admin':
        return { bg: '#332418', bar: '#B98154', accentText: '#F5C69C', emoji: '🗂️' };
      case 'background_job':
        return { bg: '#1E2635', bar: '#5A7398', accentText: '#AFC3DF', emoji: '⚙️' };
      case 'personal':
        return { bg: '#173024', bar: '#4E9E70', accentText: '#9FE3B8', emoji: '🌿' };
      default:
        return { bg: '#322B16', bar: '#B99740', accentText: '#F5D98A', emoji: '📝' };
    }
  }

  switch (cat) {
    case 'coding':
      return { bg: '#CAE5FF', bar: '#9FC8F5', accentText: '#2B558A', emoji: '💻' };
    case 'writing':
      return { bg: '#C5F1F0', bar: '#92DBD9', accentText: '#1F5C5B', emoji: '✍️' };
    case 'studying':
    case 'research':
      return { bg: '#E1D5FF', bar: '#C4AEFA', accentText: '#533B8C', emoji: '📚' };
    case 'design':
      return { bg: '#FFF0A8', bar: '#F2DA70', accentText: '#6F5812', emoji: '🎨' };
    case 'meeting':
      return { bg: '#FFD2E5', bar: '#F4A6C7', accentText: '#873157', emoji: '💬' };
    case 'admin':
      return { bg: '#FFD9BA', bar: '#F5BA8C', accentText: '#82461C', emoji: '🗂️' };
    case 'background_job':
      return { bg: '#E6EDF7', bar: '#B9CBE6', accentText: '#3A4F73', emoji: '⚙️' };
    case 'personal':
      return { bg: '#C9F1D6', bar: '#94DBAC', accentText: '#23633D', emoji: '🌿' };
    default:
      return { bg: '#FFF0A8', bar: '#EBD57A', accentText: '#665319', emoji: '📝' };
  }
}
