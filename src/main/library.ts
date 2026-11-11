import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';

export interface LibraryEntry {
  path: string;
  name: string;
  thumbnail: string | null;
  openedAt: number;
}

let db: Database | null = null;
let dbFile = '';
let initPromise: Promise<void> | null = null;

async function persist(): Promise<void> {
  if (!db) return;
  await fs.writeFile(dbFile, Buffer.from(db.export()));
}

async function init(): Promise<void> {
  if (db) return;
  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs();
      dbFile = path.join(app.getPath('userData'), 'library.db');
      let existing: Buffer | null = null;
      try {
        existing = await fs.readFile(dbFile);
      } catch {
        existing = null;
      }
      db = existing ? new SQL.Database(existing) : new SQL.Database();
      db.run(`CREATE TABLE IF NOT EXISTS photos (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        thumbnail TEXT,
        opened_at INTEGER NOT NULL
      )`);
    })();
  }
  await initPromise;
}

export async function recordPhoto(imagePath: string, name: string, thumbnail: string | null): Promise<void> {
  await init();
  db!.run('INSERT OR REPLACE INTO photos (path, name, thumbnail, opened_at) VALUES (?, ?, ?, ?)', [
    imagePath,
    name,
    thumbnail,
    Date.now(),
  ]);
  await persist();
}

export async function recentPhotos(limit = 60): Promise<LibraryEntry[]> {
  await init();
  const stmt = db!.prepare('SELECT path, name, thumbnail, opened_at FROM photos ORDER BY opened_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: LibraryEntry[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push({
      path: row.path as string,
      name: row.name as string,
      thumbnail: (row.thumbnail as string) || null,
      openedAt: row.opened_at as number,
    });
  }
  stmt.free();
  return rows;
}
