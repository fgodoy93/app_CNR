import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('terreno_cnr_offline.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY,
          folio TEXT NOT NULL,
          typeId TEXT NOT NULL,
          typeName TEXT,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          formVersionId TEXT,
          data TEXT DEFAULT '{}',
          externalRef TEXT,
          address TEXT,
          lat REAL,
          lng REAL,
          version INTEGER DEFAULT 1,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS form_versions (
          id TEXT PRIMARY KEY,
          templateId TEXT NOT NULL,
          version INTEGER NOT NULL,
          definition TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activity_types (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          name TEXT NOT NULL,
          prefix TEXT NOT NULL,
          formTemplateId TEXT,
          workflowId TEXT
        );
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          definition TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS geo_features (
          id TEXT PRIMARY KEY,
          activityId TEXT NOT NULL,
          kind TEXT NOT NULL,
          geometry TEXT NOT NULL,
          label TEXT,
          observations TEXT,
          accuracy REAL,
          capturedAt TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS evidences (
          id TEXT PRIMARY KEY,
          activityId TEXT NOT NULL,
          kind TEXT NOT NULL,
          fieldKey TEXT,
          fileUri TEXT,
          fileName TEXT,
          mimeType TEXT,
          note TEXT,
          transcript TEXT,
          source TEXT,
          lat REAL,
          lng REAL,
          accuracy REAL,
          sha256 TEXT,
          capturedAt TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          mutationId TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          op TEXT NOT NULL,
          entityId TEXT NOT NULL,
          payload TEXT NOT NULL,
          clientTime TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          error TEXT
        );
      `);
      try {
        await db.execAsync(`ALTER TABLE activity_types ADD COLUMN workflowId TEXT;`);
      } catch {
        // column already exists
      }
      return db;
    })();
  }
  return dbPromise;
}
