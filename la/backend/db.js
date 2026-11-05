const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,

  options: {
    instanceName: process.env.DB_INSTANCE,
    trustedConnection: true,
    trustServerCertificate: true
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

function db() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .catch(err => {
        poolPromise = null;
        throw err;
      });
  }

  return poolPromise;
}

function req(pool, args = {}) {
  const r = pool.request();
  for (const [key, value] of Object.entries(args)) {
    r.input(key, value);
  }
  return r;
}

module.exports = { sql, db, req };