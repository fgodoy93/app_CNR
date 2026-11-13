import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Falta DATABASE_URL en el entorno');
  process.exit(1);
}

const outDir = resolve(process.env.BACKUP_DIR || './backups');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(outDir, `terreno-cnr-${stamp}.sql`);

console.log(`Ejecutando respaldo pg_dump en ${file}...`);
execFileSync('pg_dump', ['--no-owner', '--no-privileges', '-f', file, dbUrl], { stdio: 'inherit' });
console.log('Respaldo completado.');
