const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

(async () => {
  try {
    const result = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`;
    console.log(result.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    sql.end();
  }
})();
