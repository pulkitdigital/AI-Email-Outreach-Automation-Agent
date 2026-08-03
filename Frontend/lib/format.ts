import { format, formatDistanceToNow } from 'date-fns';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(new Date(iso), 'MMM d, yyyy h:mm a');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(new Date(iso), 'MMM d, yyyy');
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
