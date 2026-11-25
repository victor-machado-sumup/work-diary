import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getTodayRange } from './today';

const pad = (n: number) => String(n).padStart(2, '0');

/** Writes the notes to ~/.config/work-diary/YYYY-MM-DD.md and returns the path. */
export async function saveNotes(content: string): Promise<string> {
  const dir = path.join(os.homedir(), '.config', 'work-diary');
  await fs.promises.mkdir(dir, { recursive: true });
  const d = getTodayRange().start;
  const name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`;
  const file = path.join(dir, name);
  await fs.promises.writeFile(file, content, 'utf8');
  return file;
}
