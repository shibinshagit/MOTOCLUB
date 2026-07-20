const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

(async () => {
  try {
    const deviceId = 4;
    const sales = await sql`
      SELECT 
        s.id,
        s.tracking_id,
        s.device_id,
        d.name as branch_name
      FROM sales s
      JOIN devices d ON s.device_id = d.id
      WHERE s.device_id IN (
        SELECT d2.id
        FROM devices d1
        JOIN devices d2 ON d2.company_id = d1.company_id
        WHERE d1.id = ${deviceId}
      )
      AND s.status = 'Pending'
      ORDER BY s.created_at DESC
    `;
    console.log("Cross-branch query result:", JSON.stringify(sales, null, 2));
  } catch (e) {
    console.error("error:", e);
  } finally {
    sql.end();
  }
})();
