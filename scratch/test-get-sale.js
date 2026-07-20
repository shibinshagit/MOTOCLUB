const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

(async () => {
  try {
    const saleId = 31; // Get an existing sale ID
    const saleResult = await sql`
        SELECT 
          s.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          c.address as customer_address,
          st.name as staff_name,
          md.tracking_url_template as tracking_url_template
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN staff st ON s.staff_id = st.id
        LEFT JOIN master_data md ON md.id = s.courier_service_id
        WHERE s.id = ${saleId}
    `;
    console.log("Sale:", saleResult[0]);
  } catch (e) {
    console.error("error:", e);
  } finally {
    sql.end();
  }
})();
