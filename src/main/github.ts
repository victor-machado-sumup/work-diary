import type { GithubActivity } from '../shared/types';
import { getSecret } from './secrets';
import { getTodayRange } from './today';

const GRAPHQL_URL = 'https://api.github.com/graphql';
const ORG = process.env.WORK_DIARY_GITHUB_ORG?.trim() || 'sumup';

const QUERY = `
query($q: String!) {
  viewer { login }
  search(query: $q, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number
        title
        url
        merged
        mergedAt
        author { login }
        mergedBy { login }
        repository { nameWithOwner }
        comments(last: 50) {
          nodes { createdAt url body author { login } }
        }
        reviews(last: 50) {
          nodes {
            submittedAt
            url
            body
            author { login }
            comments(first: 50) {
              nodes {
                createdAt
                url
                body
                path
                line
                startLine
                originalLine
                originalStartLine
                author { login }
              }
            }
          }
        }
      }
    }
  }
}`;

interface Author {
  login: string;
}
interface CommentNode {
  createdAt: string;
  url: string;
  body: string;
  author: Author | null;
  // Only present on inline review comments.
  path?: string;
  line?: number | null;
  startLine?: number | null;
  originalLine?: number | null;
  originalStartLine?: number | null;
}

/** "path:12" or "path:12-15" for inline review comments; undefined otherwise. */
function fileContext(c: CommentNode): string | undefined {
  if (!c.path) return undefined;
  // line is null when the comment is outdated; fall back to the original position.
  const end = c.line ?? c.originalLine;
  const start = c.startLine ?? c.originalStartLine;
  if (!end) return c.path;
  return start && start !== end
    ? `${c.path}:${start}-${end}`
    : `${c.path}:${end}`;
}
interface PullRequestNode {
  number: number;
  title: string;
  url: string;
  merged: boolean;
  mergedAt: string | null;
  author: Author | null;
  mergedBy: Author | null;
  repository: { nameWithOwner: string };
  comments: { nodes: CommentNode[] };
  reviews: {
    nodes: {
      submittedAt: string | null;
      url: string;
      body: string;
      author: Author | null;
      comments: { nodes: CommentNode[] };
    }[];
  };
}

/**
 * Today's GitHub activity in the configured org:
 * - PRs merged today that I authored or merged
 * - one entry per PR I commented on / reviewed today
 */
export async function getTodayActivity(): Promise<GithubActivity[]> {
  const token = await getSecret('WORK_DIARY_GITHUB_TOKEN');
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set WORK_DIARY_GITHUB_TOKEN or add it in Settings.',
    );
  }

  const { start, end } = getTodayRange();
  const startMs = start.getTime();
  const endMs = end.getTime();
  // Search date qualifiers are day-granular (UTC); go back a day and filter precisely below.
  const since = new Date(startMs - 24 * 3600 * 1000).toISOString().slice(0, 10);

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { q: `is:pr org:${ORG} involves:@me updated:>=${since}` },
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data?: { viewer: Author; search: { nodes: PullRequestNode[] } };
    errors?: { message: string }[];
  };
  if (!json.data) {
    throw new Error(
      `GitHub error: ${json.errors?.map((e) => e.message).join('; ') ?? 'unknown'}`,
    );
  }

  const me = json.data.viewer.login;
  const today = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t < endMs;
  };
  const out: GithubActivity[] = [];

  for (const pr of json.data.search.nodes) {
    if (!pr?.number) continue;
    const ref = `${pr.repository.nameWithOwner}#${pr.number}`;

    if (
      pr.merged &&
      today(pr.mergedAt) &&
      (pr.author?.login === me || pr.mergedBy?.login === me)
    ) {
      out.push({
        id: `merged-${ref}`,
        kind: 'merged',
        time: pr.mergedAt!,
        summary: `Merged PR ${ref} "${pr.title}"`,
        url: pr.url,
      });
    }

    const mine: {
      time: string;
      url: string;
      body: string;
      context?: string;
    }[] = [];
    for (const c of pr.comments.nodes) {
      if (c.author?.login === me && today(c.createdAt)) {
        mine.push({ time: c.createdAt, url: c.url, body: c.body });
      }
    }
    for (const r of pr.reviews.nodes) {
      if (r.author?.login !== me) continue;
      // A review with a body counts as a comment; its inline comments count too.
      if (r.body.trim() && today(r.submittedAt)) {
        mine.push({ time: r.submittedAt!, url: r.url, body: r.body });
      }
      for (const c of r.comments.nodes) {
        if (c.author?.login === me && today(c.createdAt)) {
          mine.push({
            time: c.createdAt,
            url: c.url,
            body: c.body,
            context: fileContext(c),
          });
        }
      }
    }
    if (mine.length > 0) {
      mine.sort((a, b) => a.time.localeCompare(b.time));
      out.push({
        id: `comment-${ref}`,
        kind: 'comment',
        time: mine[0].time,
        summary:
          `Commented on PR ${ref} "${pr.title}"` +
          (mine.length > 1 ? ` (${mine.length} comments)` : ''),
        url: mine[0].url,
        content: mine
          .filter((m) => m.body.trim())
          .map((m) => {
            // Header: file/line context (inline comments only) + permalink.
            const header = [
              m.context ? `\`${m.context}\`` : null,
              `[permalink](${m.url})`,
            ]
              .filter(Boolean)
              .join(' · ');
            return `${header}\n\n${m.body.trim()}`;
          })
          .join('\n\n---\n\n'),
      });
    }
  }
  return out;
}
