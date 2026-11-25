import type { NotionActivity } from '../shared/types';
import { log, withNotion } from './notion-mcp';
import type { NotionTools } from './notion-mcp';
import { getTodayRange } from './today';

const CONCURRENCY = 3;
/** Recently viewed pages checked for comments (the list has no timestamps). */
const RECENT_PAGES = 20;
const MAX_EDITED = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Candidate {
  id: string;
  title: string;
  url: string;
  kind: 'created' | 'edited' | 'viewed';
  /** Last edit time reported by search, when known. */
  timestamp?: string;
}

interface SearchResult {
  id: string;
  title: string;
  url: string;
  type: string;
  timestamp?: string;
}

interface VersionChange {
  first_edit_time: string;
  last_edit_time: string;
  type: 'block' | 'properties';
  action: 'added' | 'removed' | 'updated' | string;
  before?: unknown;
  after?: unknown;
}

/** `YYYY-MM-DD` of a date in local time. */
function localDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Formats a 32-hex Notion id as a dashed UUID. */
function dashed(hex: string): string {
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function idFromUrl(url: string): string | null {
  const m = /([0-9a-f]{32})(?:\?|$)/i.exec(url);
  return m ? dashed(m[1].toLowerCase()) : null;
}

async function pool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** Runs `fn`; failures on a single page must not drop the whole source. */
async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    log('skipped after error:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

async function searchPages(
  tools: NotionTools,
  filters: Record<string, unknown>,
  sort?: string,
): Promise<SearchResult[]> {
  const res = await tools.call<{ results?: SearchResult[] }>('notion-search', {
    query: '',
    filters,
    ...(sort ? { sort } : {}),
    page_size: MAX_EDITED,
  });
  return (res.results ?? []).filter((r) => r.type === 'page');
}

/** Text of a block change, as markdown. */
function afterText(change: VersionChange): string {
  return typeof change.after === 'string' ? change.after.trim() : '';
}

/**
 * Full content of the blocks I added/changed, in the order they appear in the
 * page (matched against the page as it was at the end of the range).
 */
function blocksContent(
  changes: VersionChange[],
  pageMarkdown: string | undefined,
): string {
  const seen = new Set<string>();
  const blocks = changes
    .filter((c) => c.type === 'block' && c.action !== 'removed')
    .map((c) => ({ text: afterText(c), at: c.first_edit_time }))
    .filter((b) => b.text.length > 1)
    .filter((b) => !seen.has(b.text) && seen.add(b.text));

  const positioned = blocks.map((b) => ({
    ...b,
    index: pageMarkdown ? pageMarkdown.indexOf(b.text) : -1,
  }));
  const found = positioned
    .filter((b) => b.index >= 0)
    .sort((a, b) => a.index - b.index);
  const missing = positioned
    .filter((b) => b.index < 0)
    .sort((a, b) => a.at.localeCompare(b.at));
  return [...found, ...missing].map((b) => b.text).join('\n\n');
}

async function pageActivity(
  tools: NotionTools,
  page: Candidate,
  me: string,
  start: Date,
  end: Date,
): Promise<NotionActivity | null> {
  const res = await tools.call<{ changes?: VersionChange[] }>(
    'notion-get-version-changes',
    {
      page: page.id,
      authors: [`user://${me}`],
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    },
  );
  const changes = res.changes ?? [];
  log(`[${page.kind}] "${page.title}" ${page.id}: ${changes.length} changes`);
  // No block content (only removals or property changes): nothing to report,
  // and no need to load the page snapshot.
  if (!blocksContent(changes, undefined)) {
    log(`"${page.title}" skipped: no block content`);
    return null;
  }

  const viewAt = new Date(Math.min(end.getTime(), Date.now()));
  const snapshot = await safe(() =>
    tools.call<{ content?: string }>('notion-view-version', {
      page: page.id,
      time: viewAt.toISOString(),
    }),
  );

  const time = changes
    .map((c) => c.last_edit_time)
    .sort()
    .at(-1)!;
  const created = page.kind === 'created';
  const content = blocksContent(changes, snapshot?.content);
  log(`"${page.title}" snapshot`, {
    at: viewAt.toISOString(),
    loaded: snapshot?.content !== undefined,
    changes: changes.map((c) => ({
      type: c.type,
      action: c.action,
      first: c.first_edit_time,
      last: c.last_edit_time,
      text: afterText(c).slice(0, 60),
      inPage: snapshot?.content
        ? snapshot.content.includes(afterText(c))
        : null,
    })),
    contentChars: content.length,
  });
  return {
    id: `${created ? 'created' : 'edited'}-${page.id}`,
    kind: created ? 'created' : 'edited',
    time,
    summary: `${created ? 'Created' : 'Edited'} ${page.title}`,
    url: page.url,
    content,
  };
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Comment XML body to plain markdown: mentions become `@Name`. */
function commentText(xml: string): string {
  return decode(
    xml
      .replace(/<mention [^>]*>([^<]*)<\/mention>/g, '@$1')
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

/** Value of an XML attribute in a tag. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : undefined;
}

async function commentsActivity(
  tools: NotionTools,
  page: Candidate,
  start: Date,
  end: Date,
): Promise<NotionActivity[]> {
  const res = await tools.call<{ text?: string }>('notion-get-comments', {
    page_id: page.id,
    include_resolved: true,
  });
  const xml = res.text ?? '';
  const out: NotionActivity[] = [];
  let seen = 0;
  for (const discussion of xml.matchAll(
    /<discussion\b([^>]*)>([\s\S]*?)<\/discussion>/g,
  )) {
    const context = attr(discussion[1], 'text-context');
    for (const comment of discussion[2].matchAll(
      /<comment\b([^>]*)>([\s\S]*?)<\/comment>/g,
    )) {
      seen++;
      if (attr(comment[1], 'by-you') !== 'true') continue;
      const time = attr(comment[1], 'datetime');
      if (!time) continue;
      const at = new Date(time).getTime();
      if (at < start.getTime() || at >= end.getTime()) continue;
      const body = commentText(comment[2]);
      out.push({
        id: `comment-${attr(comment[1], 'id') ?? `${page.id}-${time}`}`,
        kind: 'comment',
        time,
        summary: `Comment on ${page.title}`,
        url: attr(comment[1], 'url') ?? page.url,
        content: context ? `> ${context}\n\n${body}` : body,
      });
    }
  }
  log(
    `[comments] "${page.title}" ${page.id} (${page.kind}): ${seen} comments, ${out.length} mine today`,
  );
  return out;
}

export async function getTodayActivity(): Promise<NotionActivity[]> {
  const { start, end } = getTodayRange();

  return withNotion(async (tools) => {
    const self = await tools.call<{ user: { id: string } }>(
      'notion-get-self',
      {},
    );
    const me = self.user.id;
    log('range', start.toISOString(), '->', end.toISOString(), 'me', me);

    // Search dates are day-granular and their time zone is not documented, so
    // the edited range is widened by a day; `timestamp` then trims it.
    const [edited, created, recent] = await Promise.all([
      searchPages(
        tools,
        {
          edited_by_user_ids: ['me'],
          last_edited_date_range: {
            start_date: localDate(new Date(start.getTime() - DAY_MS)),
            end_date: localDate(new Date(Date.now() + DAY_MS)),
          },
        },
        'last_edited',
      ),
      searchPages(tools, {
        created_by_user_ids: ['me'],
        created_date_range: {
          start_date: localDate(start),
          end_date: localDate(new Date(end.getTime() - 1)),
        },
      }),
      tools
        .call<{ results?: { url: string; title: string }[] }>(
          'notion-list-recent-pages',
          { limit: RECENT_PAGES },
        )
        .then((r) => r.results ?? [])
        .catch(() => []),
    ]);

    const brief = (rs: { title: string; timestamp?: string }[]) =>
      rs.map((r) => `${r.title} @ ${r.timestamp ?? '?'}`);
    log('search edited', edited.length, brief(edited));
    log('search created', created.length, brief(created));
    log(
      'recent pages',
      recent.length,
      recent.map((r) => r.title),
    );

    const candidates = new Map<string, Candidate>();
    const add = (c: Candidate) => {
      const existing = candidates.get(c.id);
      // "created" wins over "edited", which wins over "viewed".
      const rank = { created: 2, edited: 1, viewed: 0 };
      if (!existing || rank[c.kind] > rank[existing.kind]) {
        candidates.set(c.id, c);
      }
    };
    for (const r of recent) {
      const id = idFromUrl(r.url);
      if (id)
        add({ id, title: r.title || 'Untitled', url: r.url, kind: 'viewed' });
    }
    for (const r of edited) {
      // Last edit before today: nothing of mine happened today.
      if (
        r.timestamp &&
        new Date(r.timestamp).getTime() < start.getTime() - 60_000
      ) {
        continue;
      }
      add({
        id: r.id,
        title: r.title || 'Untitled',
        url: r.url,
        kind: 'edited',
        timestamp: r.timestamp,
      });
    }
    for (const r of created) {
      add({
        id: r.id,
        title: r.title || 'Untitled',
        url: r.url,
        kind: 'created',
      });
    }

    const all = [...candidates.values()];
    log(
      `${all.length} candidates:`,
      all.map((c) => `${c.kind}:${c.title}`),
    );
    const authored = all.filter((c) => c.kind !== 'viewed');

    const [pages, comments] = await Promise.all([
      pool(authored, (page) =>
        safe(() => pageActivity(tools, page, me, start, end)),
      ),
      pool(all, (page) =>
        safe(() => commentsActivity(tools, page, start, end)),
      ),
    ]);

    const result = [
      ...pages.filter((p): p is NotionActivity => !!p),
      ...comments.flatMap((c) => c ?? []),
    ];
    log(
      `${result.length} activities:`,
      result.map((a) => `${a.time} ${a.summary}`),
    );
    return result;
  });
}
