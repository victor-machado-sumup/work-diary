import { app } from 'electron';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { VscodeActivity } from '../shared/types';
import { getTodayRange } from './today';

// VSCode flavours whose hot-exit backups are scanned.
const FLAVOURS = ['Code', 'Code - Insiders', 'VSCodium'];
const MAX_SUMMARY_LENGTH = 80;

/**
 * VSCode rewrites every backup file when it restores a window (e.g. after a
 * restart), which bumps `mtime` without any edit. So the time of the last real
 * change is tracked here: it only moves when the content hash changes.
 */
interface FileState {
  hash: string;
  /** ISO time the content was last seen to change. */
  changedAt: string;
}

const stateFile = () => path.join(app.getPath('userData'), 'vscode-state.json');

async function loadState(): Promise<Record<string, FileState>> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/**
 * VSCode "hot exit" backups store each unsaved untitled editor at
 * `<userData>/Backups/<workspace-id>/untitled/<id>`. The first line is
 * `untitled:<Name> <json metadata>` and the rest is the file content.
 */
async function scan(): Promise<{
  out: VscodeActivity[];
  next: Record<string, FileState>;
}> {
  const { start, end } = getTodayRange();
  const appData = app.getPath('appData');
  const previous = await loadState();
  const next: Record<string, FileState> = {};
  const out: VscodeActivity[] = [];

  for (const flavour of FLAVOURS) {
    const backups = path.join(appData, flavour, 'Backups');
    for (const workspace of await readDirSafe(backups)) {
      const untitledDir = path.join(backups, workspace, 'untitled');
      for (const entry of await readDirSafe(untitledDir)) {
        const file = path.join(untitledDir, entry);
        try {
          const stat = await fs.stat(file);
          if (!stat.isFile()) continue;
          const raw = await fs.readFile(file, 'utf8');
          const newline = raw.indexOf('\n');
          const header = newline === -1 ? raw : raw.slice(0, newline);
          const content = (newline === -1 ? '' : raw.slice(newline + 1)).trim();

          const id = `${flavour}-${workspace}-${entry}`;
          const hash = createHash('sha256').update(content).digest('hex');
          const known = previous[id];
          // Unchanged content keeps its old time, whatever `mtime` says. A new
          // file (or changed content) takes `mtime`.
          const changedAt =
            known && known.hash === hash
              ? known.changedAt
              : stat.mtime.toISOString();
          next[id] = { hash, changedAt };

          const changed = new Date(changedAt);
          if (!content || changed < start || changed >= end) continue;

          const name = /^untitled:(\S+)/.exec(header)?.[1] ?? 'Untitled';
          const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? '';
          const snippet =
            firstLine.trim().length > MAX_SUMMARY_LENGTH
              ? `${firstLine.trim().slice(0, MAX_SUMMARY_LENGTH)}…`
              : firstLine.trim();
          out.push({
            id,
            time: changedAt,
            summary: `${name}: ${snippet}`,
            url: '',
            content,
          });
        } catch {
          // Backup may be rewritten or removed by VSCode while we read it.
        }
      }
    }
  }

  return { out: out.sort((a, b) => a.time.localeCompare(b.time)), next };
}

/** Today's untitled-file activity. Read-only: the state is only saved by `saveState`. */
export async function getTodayActivity(): Promise<VscodeActivity[]> {
  return (await scan()).out;
}

/**
 * Records the current content hashes and change times. Called when the notes
 * are saved, so reopening the app the same day still sees the day's edits.
 * Files that no longer exist are dropped from the state.
 */
export async function saveState(): Promise<void> {
  const { next } = await scan();
  await fs.writeFile(stateFile(), JSON.stringify(next), 'utf8').catch(() => {});
}
