import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { VscodeActivity } from '../shared/types';
import { getTodayRange } from './today';

// VSCode flavours whose hot-exit backups are scanned.
const FLAVOURS = ['Code', 'Code - Insiders', 'VSCodium'];
const MAX_SUMMARY_LENGTH = 80;

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
export async function getTodayActivity(): Promise<VscodeActivity[]> {
  const { start, end } = getTodayRange();
  const appData = app.getPath('appData');
  const out: VscodeActivity[] = [];

  for (const flavour of FLAVOURS) {
    const backups = path.join(appData, flavour, 'Backups');
    for (const workspace of await readDirSafe(backups)) {
      const untitledDir = path.join(backups, workspace, 'untitled');
      for (const entry of await readDirSafe(untitledDir)) {
        const file = path.join(untitledDir, entry);
        try {
          const stat = await fs.stat(file);
          if (!stat.isFile() || stat.mtime < start || stat.mtime >= end) {
            continue;
          }
          const raw = await fs.readFile(file, 'utf8');
          const newline = raw.indexOf('\n');
          const header = newline === -1 ? raw : raw.slice(0, newline);
          const content = (newline === -1 ? '' : raw.slice(newline + 1)).trim();
          if (!content) continue;

          const name = /^untitled:(\S+)/.exec(header)?.[1] ?? 'Untitled';
          const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? '';
          const snippet =
            firstLine.trim().length > MAX_SUMMARY_LENGTH
              ? `${firstLine.trim().slice(0, MAX_SUMMARY_LENGTH)}…`
              : firstLine.trim();
          out.push({
            id: `${flavour}-${workspace}-${entry}`,
            time: stat.mtime.toISOString(),
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

  return out.sort((a, b) => a.time.localeCompare(b.time));
}
