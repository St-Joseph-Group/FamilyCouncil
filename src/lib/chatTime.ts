/**
 * Timestamp formatting for the two chat surfaces.
 *
 * Both the Chatbot page and the floating chatbox labelled messages with a bare
 * time — "08:44 AM" — and nothing else. In a conversation spanning several
 * days, or one reopened a week later, that is genuinely ambiguous: no date
 * appeared anywhere in the thread.
 *
 * The fix follows what Slack, WhatsApp and Teams all do, rather than stamping a
 * full date onto every bubble, which is noisy and no major chat product does:
 *
 *   - a day separator introduces each new date in the thread
 *   - a message keeps a short time, because the separator above it has already
 *     established the day
 *   - a message from an earlier day still spells its date out, so a bubble read
 *     on its own is never ambiguous
 *   - every message carries the complete date and time as a tooltip
 *
 * Locale is left to the browser so dates read the way the reader expects. The
 * page hardcoded 'en' while the floating chatbox did not, so the same message
 * could be labelled two different ways depending on where it was shown.
 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole days between two instants, ignoring the time of day. Comparing
 * calendar days rather than subtracting 24-hour spans is what makes a message
 * sent at 23:50 read as "Yesterday" twenty minutes later instead of "Today".
 */
function dayOffset(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** A year is noise on this year's messages and essential on last year's. */
function yearIfNeeded(d: Date): Intl.DateTimeFormatOptions {
  return d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' };
}

function parse(ts: string): Date | null {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when two timestamps fall on the same calendar day. */
export function isSameDay(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return false;
  return startOfDay(x).getTime() === startOfDay(y).getTime();
}

/**
 * Heading above the first message of each day:
 * "Today", "Yesterday", "Monday, 9 August 2026".
 */
export function formatDaySeparator(ts: string): string {
  const d = parse(ts);
  if (!d) return '';
  const offset = dayOffset(d, new Date());
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...yearIfNeeded(d),
  });
}

/**
 * The small label under a bubble. Time alone for today, because the separator
 * above already carries the day; date and time for anything older.
 */
export function formatMessageTimestamp(ts: string): string {
  const d = parse(ts);
  if (!d) return '';
  const time = d.toLocaleTimeString(undefined, TIME);
  const offset = dayOffset(d, new Date());
  if (offset === 0) return time;
  if (offset === 1) return `Yesterday, ${time}`;
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...yearIfNeeded(d) });
  return `${date}, ${time}`;
}

/** Unabbreviated, for the tooltip. Never relative, never shortened. */
export function formatFullTimestamp(ts: string): string {
  const d = parse(ts);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...TIME,
  });
}

/** Compact label for the conversation list: time today, a short date before. */
export function formatListTimestamp(ts: string): string {
  const d = parse(ts);
  if (!d) return '';
  const offset = dayOffset(d, new Date());
  if (offset === 0) return d.toLocaleTimeString(undefined, TIME);
  if (offset === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...yearIfNeeded(d) });
}
