/** Formats a Date to match SQLite's own `datetime('now')` output ('YYYY-MM-DD HH:MM:SS',
 *  UTC, space-separated) — a plain `>=`/`<=` string comparison against a `datetime()`-default
 *  column only works if both sides share this exact format. */
export const toSqliteDatetime = (date: Date): string => date.toISOString().slice(0, 19).replace('T', ' ');
