const { Pool } = require('pg');

// In the container DATABASE_URL points at the "postgres" service. Running the
// backend directly on the host (npm run dev:backend) falls back to the same
// database through the port docker-compose publishes on localhost.
const CONNECTION_STRING =
  process.env.DATABASE_URL || 'postgresql://superapp:superapp_secret@localhost:5432/superapp';

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) console.warn(`Slow query (${duration}ms):`, text.substring(0, 80));
  return result;
}

async function getClient() {
  return pool.connect();
}

async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as time, current_database() as db');
    return { ok: true, time: result.rows[0].time, db: result.rows[0].db };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, query, getClient, healthCheck };
