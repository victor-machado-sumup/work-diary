/**
 * TEMPORARY: number of days to shift "today" by (-1 = yesterday).
 * Set to 0 to go back to the real current day.
 */
const FAKE_TODAY_OFFSET_DAYS = -1;

/** Local-time [start, end) range of the (possibly faked) "today". */
export function getTodayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + FAKE_TODAY_OFFSET_DAYS);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
