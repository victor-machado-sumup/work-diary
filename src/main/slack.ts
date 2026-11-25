import type { SlackActivity } from '../shared/types';
import { getSecret } from './secrets';
import { getSetting } from './settings';
import { getTodayRange } from './today';

const API = 'https://slack.com/api';
// How far back to look for threads I started that may have received replies today.
const lookbackDays = () =>
  Number(getSetting('WORK_DIARY_SLACK_LOOKBACK_DAYS')) || 7;
// Messages shown before the first message sent today in a thread, for context.
const THREAD_CONTEXT_MESSAGES = 4;
const MAX_SEARCH_PAGES = 10;
const MAX_ROOT_CANDIDATES = 80;
const CONCURRENCY = 5;

interface SlackChannel {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
}
interface SearchMatch {
  channel: SlackChannel;
  ts: string;
  text: string;
  permalink: string;
}
interface SlackMessage {
  ts: string;
  thread_ts?: string;
  user?: string;
  username?: string;
  text?: string;
  reply_count?: number;
  latest_reply?: string;
  reactions?: { name: string; users: string[] }[];
}

async function call<T>(
  method: string,
  params: Record<string, string | number | undefined> = {},
  retry = true,
): Promise<T> {
  const token = await getSecret('WORK_DIARY_SLACK_TOKEN');
  if (!token) {
    throw new Error(
      'Missing Slack token. Set WORK_DIARY_SLACK_TOKEN or add it in Settings.',
    );
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const res = await fetch(`${API}/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429 && retry) {
    const wait = Number(res.headers.get('Retry-After')) || 2;
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call<T>(method, params, false);
  }
  if (!res.ok) {
    throw new Error(`Slack request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  if (!json.ok) throw new Error(`Slack ${method} error: ${json.error}`);
  return json;
}

/** Runs `fn` over `items` with limited concurrency, preserving order. */
async function pool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const userNames = new Map<string, Promise<string>>();
function userName(id: string): Promise<string> {
  let p = userNames.get(id);
  if (!p) {
    p = call<{
      user: {
        name: string;
        real_name?: string;
        profile?: { display_name?: string; real_name?: string };
      };
    }>('users.info', { user: id })
      .then(
        ({ user }) =>
          user.profile?.display_name ||
          user.profile?.real_name ||
          user.real_name ||
          user.name,
      )
      .catch(() => id);
    userNames.set(id, p);
  }
  return p;
}

/** Converts Slack mrkdwn tokens (mentions, links, entities) to plain markdown. */
async function formatText(text: string): Promise<string> {
  let out = text;
  const ids = [...new Set(out.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g))];
  const names = new Map<string, string>();
  await Promise.all(
    ids.map(async (m) => names.set(m[1], await userName(m[1]))),
  );
  out = out
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => `@${names.get(id)}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, '$1')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return out.trim();
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function oneLine(text: string, max = 100): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** One "- Name: text" bullet per message; multi-line text stays inside the bullet. */
async function formatMessages(messages: SlackMessage[]): Promise<string> {
  const lines = await Promise.all(
    messages.map(async (m) => {
      const who = m.user ? await userName(m.user) : (m.username ?? 'unknown');
      const text = (await formatText(m.text ?? '')).replace(/\n/g, '\n  ');
      return `- ${who}: ${text}`;
    }),
  );
  return lines.join('\n');
}

/** Fetches every message of a thread (root first). */
async function fetchThread(
  channel: string,
  threadTs: string,
): Promise<SlackMessage[]> {
  const out: SlackMessage[] = [];
  let cursor: string | undefined;
  do {
    const res = await call<{
      messages: SlackMessage[];
      response_metadata?: { next_cursor?: string };
    }>('conversations.replies', {
      channel,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    out.push(...res.messages);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out;
}

/**
 * Today's Slack activity:
 * - threads with replies today that I started or replied to
 * - one entry per DM where I sent a message or reacted today
 */
export async function getTodayActivity(): Promise<SlackActivity[]> {
  const { start, end } = getTodayRange();
  const startSec = start.getTime() / 1000;
  const endSec = end.getTime() / 1000;
  const isToday = (ts: string) => Number(ts) >= startSec && Number(ts) < endSec;

  const auth = await call<{ user_id: string; url: string }>('auth.test');
  const me = auth.user_id;
  const workspaceUrl = auth.url.replace(/\/?$/, '/');

  // All my messages within the lookback window (search is day-granular).
  const lookbackStart = new Date(start);
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays());
  const after = new Date(lookbackStart);
  after.setDate(after.getDate() - 1);
  const mine: SearchMatch[] = [];
  for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
    const res = await call<{
      messages: { matches: SearchMatch[]; paging: { pages: number } };
    }>('search.messages', {
      query: `from:<@${me}> after:${localDate(after)}`,
      sort: 'timestamp',
      sort_dir: 'desc',
      count: 100,
      page,
    });
    mine.push(...res.messages.matches);
    if (page >= res.messages.paging.pages) break;
  }

  const out: SlackActivity[] = [];

  // ---- Threads ----
  const candidates = new Map<
    string,
    { channel: SlackChannel; threadTs: string }
  >();
  const rootCandidates = new Map<
    string,
    { channel: SlackChannel; threadTs: string }
  >();
  for (const m of mine) {
    if (m.channel.is_im || m.channel.is_mpim) continue;
    const threadTs = new URL(m.permalink).searchParams.get('thread_ts');
    if (threadTs) {
      // A reply of mine: only threads I replied to today can qualify.
      if (isToday(m.ts)) {
        candidates.set(`${m.channel.id}:${threadTs}`, {
          channel: m.channel,
          threadTs,
        });
      }
    } else {
      // A top-level message of mine: qualifies if others replied today.
      rootCandidates.set(`${m.channel.id}:${m.ts}`, {
        channel: m.channel,
        threadTs: m.ts,
      });
    }
  }
  for (const [key, c] of [...rootCandidates].slice(0, MAX_ROOT_CANDIDATES)) {
    candidates.set(key, c);
  }

  const threads = await pool([...candidates.values()], async (c) => {
    try {
      return { c, messages: await fetchThread(c.channel.id, c.threadTs) };
    } catch {
      return { c, messages: [] as SlackMessage[] };
    }
  });

  for (const { c, messages } of threads) {
    if (messages.length < 2) continue;
    const root = messages[0];
    const todayReplies = messages.slice(1).filter((m) => isToday(m.ts));
    if (todayReplies.length === 0) continue;
    const iReplied = todayReplies.some((m) => m.user === me);
    if (root.user !== me && !iReplied) continue;

    const firstToday = messages.findIndex((m) => isToday(m.ts));
    const from = Math.max(0, firstToday - THREAD_CONTEXT_MESSAGES);
    const channelLabel = c.channel.name ? `#${c.channel.name}` : 'thread';
    out.push({
      id: `thread-${c.channel.id}-${c.threadTs}`,
      kind: 'thread',
      time: new Date(Number(messages[firstToday].ts) * 1000).toISOString(),
      summary: `${channelLabel}: ${oneLine(await formatText(root.text ?? ''))}`,
      url: `${workspaceUrl}archives/${c.channel.id}/p${c.threadTs.replace('.', '')}`,
      content: await formatMessages(messages.slice(from)),
    });
  }

  // ---- DMs and group DMs ----
  const dmChannels = new Set<string>();
  const todayThreadRoots = new Map<string, Set<string>>();
  for (const m of mine) {
    if (!(m.channel.is_im || m.channel.is_mpim) || !isToday(m.ts)) continue;
    dmChannels.add(m.channel.id);
    // My replies today in threads that may be older than the history window.
    const threadTs = new URL(m.permalink).searchParams.get('thread_ts');
    if (threadTs) {
      const roots = todayThreadRoots.get(m.channel.id) ?? new Set<string>();
      roots.add(threadTs);
      todayThreadRoots.set(m.channel.id, roots);
    }
  }
  // Reactions carry no timestamp, so only reactions on messages sent today are detected.
  try {
    const res = await call<{
      items: { type: string; channel?: string; message?: { ts: string } }[];
    }>('reactions.list', { user: me, count: 100 });
    const reactedChannels = new Set<string>();
    for (const item of res.items) {
      if (item.type === 'message' && item.channel && item.message) {
        if (isToday(item.message.ts)) reactedChannels.add(item.channel);
      }
    }
    await pool([...reactedChannels], async (channel) => {
      const { channel: info } = await call<{ channel: SlackChannel }>(
        'conversations.info',
        { channel },
      );
      if (info.is_im || info.is_mpim) dmChannels.add(channel);
    });
  } catch {
    // Missing reactions:read scope: fall back to messages only.
  }

  const conversations = await pool([...dmChannels], async (channel) => {
    const [info, members] = await Promise.all([
      call<{ channel: SlackChannel & { user?: string } }>(
        'conversations.info',
        {
          channel,
        },
      ),
      call<{ members: string[] }>('conversations.members', {
        channel,
        limit: 50,
      }).catch(() => ({ members: [] as string[] })),
    ]);

    // Top-level history within the lookback window (newest first).
    const history: SlackMessage[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const res = await call<{
        messages: SlackMessage[];
        response_metadata?: { next_cursor?: string };
      }>('conversations.history', {
        channel,
        oldest: lookbackStart.getTime() / 1000,
        latest: endSec,
        inclusive: 'true',
        limit: 200,
        cursor,
      });
      history.push(...res.messages);
      cursor = res.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }

    // Each unit is either a standalone message or a whole thread, keyed by root ts.
    const units = new Map<string, SlackMessage[]>();
    const rootsToFetch = new Set(todayThreadRoots.get(channel) ?? []);
    for (const m of history) {
      if (m.thread_ts && m.thread_ts !== m.ts) continue; // broadcast reply
      if (m.reply_count && Number(m.latest_reply) >= startSec) {
        rootsToFetch.add(m.ts);
      } else if (isToday(m.ts)) {
        units.set(m.ts, [m]);
      }
    }
    const fetched = await pool([...rootsToFetch], async (root) => {
      try {
        return await fetchThread(channel, root);
      } catch {
        return [] as SlackMessage[];
      }
    });
    for (const thread of fetched) {
      // Keep only threads with any interaction today.
      if (thread.some((m) => isToday(m.ts))) units.set(thread[0].ts, thread);
    }

    const messages = [...units.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([, msgs]) => msgs);
    return { channel, info: info.channel, members: members.members, messages };
  });

  for (const { channel, info, members, messages } of conversations) {
    const todays = messages.filter((m) => isToday(m.ts));
    if (todays.length === 0) continue;
    // Summary: first message I sent today (falls back to the first one today).
    const first = todays.find((m) => m.user === me) ?? todays[0];

    const others = (
      info.is_im && info.user ? [info.user] : members.filter((u) => u !== me)
    ).filter(Boolean);
    const names = await Promise.all(others.map(userName));
    const label = info.is_im
      ? `DM with ${names[0]}`
      : `Group DM with ${names.join(', ')}`;
    out.push({
      id: `dm-${channel}`,
      kind: 'dm',
      time: new Date(Number(first.ts) * 1000).toISOString(),
      summary: `${label}: ${oneLine(await formatText(first.text ?? ''))}`,
      url: `${workspaceUrl}archives/${channel}/p${first.ts.replace('.', '')}`,
      content: await formatMessages(messages),
    });
  }

  return out;
}
