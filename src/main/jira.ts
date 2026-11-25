import type { JiraActivity } from '../shared/types';
import { getSecret } from './secrets';
import { getSetting } from './settings';
import { getTodayRange } from './today';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

interface ChangelogItem {
  field: string;
  fromString?: string | null;
  toString?: string | null;
}
interface History {
  created: string;
  author?: { accountId?: string };
  items: ChangelogItem[];
}
/** Atlassian Document Format node (the format of the description in API v3). */
interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: AdfNode[];
}

function adfInline(nodes: AdfNode[] = []): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text': {
          let t = n.text ?? '';
          for (const m of n.marks ?? []) {
            if (m.type === 'code') t = `\`${t}\``;
            else if (m.type === 'strong') t = `**${t}**`;
            else if (m.type === 'em') t = `*${t}*`;
            else if (m.type === 'link' && m.attrs?.href)
              t = `[${t}](${String(m.attrs.href)})`;
          }
          return t;
        }
        case 'hardBreak':
          return '\n';
        case 'mention':
          return String(n.attrs?.text ?? '@user');
        case 'inlineCard':
          return String(n.attrs?.url ?? '');
        case 'emoji':
          return String(n.attrs?.text ?? n.attrs?.shortName ?? '');
        default:
          return adfInline(n.content);
      }
    })
    .join('');
}

function adfBlocks(nodes: AdfNode[] = [], indent = ''): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        out.push(`${indent}${adfInline(n.content)}`);
        break;
      case 'heading':
        out.push(
          `${indent}${'#'.repeat(Number(n.attrs?.level) || 1)} ${adfInline(n.content)}`,
        );
        break;
      case 'bulletList':
      case 'orderedList':
        (n.content ?? []).forEach((item, i) => {
          const marker = n.type === 'bulletList' ? '-' : `${i + 1}.`;
          const [first, ...rest] = adfBlocks(item.content, '');
          out.push(`${indent}${marker} ${first ?? ''}`);
          for (const r of rest) out.push(r ? `${indent}  ${r}` : '');
        });
        break;
      case 'codeBlock':
        out.push(
          `${indent}\`\`\``,
          ...adfInline(n.content)
            .split('\n')
            .map((l) => `${indent}${l}`),
          `${indent}\`\`\``,
        );
        break;
      case 'blockquote':
        out.push(...adfBlocks(n.content).map((l) => `${indent}> ${l}`));
        break;
      case 'rule':
        out.push(`${indent}---`);
        break;
      default:
        // Panels, tables, expands...: flatten their text content.
        if (n.content?.some((c) => c.type === 'text' || c.type === 'hardBreak'))
          out.push(`${indent}${adfInline(n.content)}`);
        else out.push(...adfBlocks(n.content, indent));
    }
  }
  return out;
}

function adfToMarkdown(doc?: AdfNode | null): string {
  return doc ? adfBlocks(doc.content).join('\n').trim() : '';
}

interface Issue {
  key: string;
  fields: {
    summary: string;
    created: string;
    creator?: { accountId?: string };
    assignee?: { accountId?: string } | null;
    description?: AdfNode | null;
  };
  changelog?: { histories: History[] };
}

async function config() {
  const baseUrl = getSetting('WORK_DIARY_JIRA_URL').replace(/\/+$/, '');
  const email = getSetting('WORK_DIARY_JIRA_EMAIL');
  const token = await getSecret('WORK_DIARY_JIRA_TOKEN');
  if (!baseUrl || !email || !token) {
    throw new Error(
      'Missing Jira config. Set the Jira URL, email and API token (WORK_DIARY_JIRA_URL, WORK_DIARY_JIRA_EMAIL, WORK_DIARY_JIRA_TOKEN) or add them in Settings.',
    );
  }
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  return { baseUrl, auth };
}

function jqlDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Today's Jira activity: one entry per issue that I created, edited or moved
 * to Done today. "Edited" is detected from the issue changelog.
 *
 * Candidate issues are limited to those updated today where I'm the reporter
 * or an (ex-)assignee, where I changed the status, or that belong to the
 * configured project (WORK_DIARY_JIRA_PROJECT). Edits to other issues are not
 * detected.
 */
export async function getTodayActivity(): Promise<JiraActivity[]> {
  const { baseUrl, auth } = await config();
  const { start, end } = getTodayRange();

  const request = async <T>(
    path: string,
    init?: { method: string; body: unknown },
  ): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(init ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Jira request failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  };

  const me = (await request<{ accountId: string }>('/rest/api/3/myself'))
    .accountId;
  const s = jqlDate(start);
  const e = jqlDate(end);
  const project = getSetting('WORK_DIARY_JIRA_PROJECT').replace(/"/g, '');
  const jql =
    `updated >= "${s}" AND updated < "${e}" AND (` +
    (project ? `project = "${project}" OR ` : '') +
    `reporter = currentUser() OR assignee = currentUser() OR assignee was currentUser() ` +
    `OR status changed BY currentUser() DURING ("${s}", "${e}")) ORDER BY updated ASC`;

  const issues: Issue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await request<{
      issues: Issue[];
      nextPageToken?: string;
    }>('/rest/api/3/search/jql', {
      method: 'POST',
      body: {
        jql,
        fields: ['summary', 'created', 'creator', 'assignee', 'description'],
        expand: 'changelog',
        maxResults: PAGE_SIZE,
        nextPageToken,
      },
    });
    issues.push(...res.issues);
    nextPageToken = res.nextPageToken;
    if (!nextPageToken) break;
  }

  const inToday = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t < end.getTime();
  };

  const out: JiraActivity[] = [];
  for (const issue of issues) {
    const createdToday =
      issue.fields.creator?.accountId === me && inToday(issue.fields.created);
    const isAssignee = issue.fields.assignee?.accountId === me;
    // The Done transition counts whoever made it, as long as I'm the assignee.
    const todayHistories = (issue.changelog?.histories ?? []).filter((h) =>
      inToday(h.created),
    );
    const doneEntry = isAssignee
      ? todayHistories.find((h) =>
          h.items.some(
            (i) =>
              i.field === 'status' &&
              i.toString?.trim().toLowerCase() === 'done',
          ),
        )
      : undefined;
    // Only my description edits count as "edited"; the Done transition is kept
    // whole (only when I'm the assignee), whoever made it.
    const mine = todayHistories
      .filter((h) => h === doneEntry || h.author?.accountId === me)
      .map((h) => ({
        ...h,
        items:
          h === doneEntry
            ? h.items
            : h.items.filter((i) => i.field === 'description'),
      }))
      .filter((h) => h.items.length > 0);
    if (!createdToday && !doneEntry && mine.length === 0) continue;

    const kind = doneEntry ? 'done' : createdToday ? 'created' : 'edited';
    const times = mine.map((h) => h.created);
    if (createdToday) times.push(issue.fields.created);
    const time = times.reduce((a, b) => (a > b ? a : b));

    const lines: string[] = [];
    if (createdToday) lines.push('- Created the issue');
    for (const h of mine) {
      for (const i of h.items) {
        lines.push(
          i.field === 'description'
            ? '- Edited the description'
            : `- ${i.field}: ${i.fromString || '(empty)'} → ${i.toString || '(empty)'}`,
        );
      }
    }

    const description = adfToMarkdown(issue.fields.description);
    const label = {
      created: 'Created',
      done: 'Moved to Done',
      edited: 'Edited',
    }[kind];
    out.push({
      id: issue.key,
      kind,
      time: new Date(time).toISOString(),
      summary: `${label} ${issue.key}: ${issue.fields.summary}`,
      url: `${baseUrl}/browse/${issue.key}`,
      content: [
        lines.join('\n'),
        description && `Description:\n\n${description}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  }
  return out;
}
