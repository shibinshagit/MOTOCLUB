const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

(async () => {
  try {
    const sales = await sql`SELECT id, tracking_id, status, payment_status, device_id, DATE(sale_date) as sdate FROM sales ORDER BY id DESC LIMIT 10`;
    console.log(JSON.stringify(sales, null, 2));
  } catch (e) {
    console.error("error:", e);
  } finally {
    sql.end();
  }
})();
