export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : null;

export const fmtDuration = (isoDur: string | null | undefined) => {
  if (!isoDur) return null;
  const m = isoDur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  const h = parseInt(m?.[1] ?? '0', 10);
  const min = parseInt(m?.[2] ?? '0', 10);
  return `${h}h${min > 0 ? ` ${min}m` : ''}`;
};

/** UTC timestamp as YYYYMMDD-HHMMSS, safe to drop straight into a filename (no colons/dashes). */
export const fmtTimestampForFilename = (date: Date = new Date()): string => {
  const iso = date.toISOString(); // e.g. 2026-07-27T18:42:09.465Z
  const datePart = iso.slice(0, 10).replace(/-/g, '');  // 20260727
  const timePart = iso.slice(11, 19).replace(/:/g, ''); // 184209
  return `${datePart}-${timePart}`;
};
