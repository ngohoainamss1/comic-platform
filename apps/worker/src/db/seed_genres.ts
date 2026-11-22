import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

async function seed() {
  const url = process.env.TURSO_DATABASE_URL || 'libsql://comic-db-ngohoainamss1.aws-ap-southeast-1.turso.io';
  const authToken = process.env.TURSO_AUTH_TOKEN || '';

  const client = createClient({ url, authToken });

  // Read vina_genres.json from root scripts or apps/worker
  const genresPath = path.resolve('../../../scripts/vina_genres.json');
  if (!fs.existsSync(genresPath)) {
    console.error('vina_genres.json not found at', genresPath);
    return;
  }

  const genres = JSON.parse(fs.readFileSync(genresPath, 'utf-8'));
  console.log(`Seeding ${genres.length} genres to Turso database...`);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      comic_count INTEGER DEFAULT 0
    )
  `);

  try { await client.execute('ALTER TABLE genres ADD COLUMN description TEXT DEFAULT ""'); } catch {}
  try { await client.execute('ALTER TABLE genres ADD COLUMN comic_count INTEGER DEFAULT 0'); } catch {}

  for (const g of genres) {
    await client.execute({
      sql: 'INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES (?, ?, ?, ?)',
      args: [g.slug, g.name, g.description || '', g.comic_count || 0]
    });
  }

  console.log('Successfully seeded all 224 genres to Turso database!');
}

seed().catch(console.error);
