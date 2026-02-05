import 'dotenv/config';
import { query } from './db.js';

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 100
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      options TEXT[] NOT NULL,
      creator_id TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      outcome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bets (
      id SERIAL PRIMARY KEY,
      prediction_id INTEGER NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      prediction TEXT NOT NULL,
      amount INTEGER NOT NULL
    );
  `);

  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
