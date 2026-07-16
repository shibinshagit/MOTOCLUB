require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
async function run() {
  const purchaseId = 1; // Or grab the latest one
  const latestPurchase = await sql`SELECT id FROM purchases ORDER BY id DESC LIMIT 1`;
  if (latestPurchase.length === 0) return console.log("No purchases found");
  
  const pid = latestPurchase[0].id;
  const items = await sql`
      SELECT 
        pi.*, 
        p.name as product_name, 
        p.category,
        p.is_batch_managed,
        pv.name as variant_name,
        pb.batch_no as batch_number,
        pb.manufacture_date as mfg_date,
        pb.expiry_date,
        pb.selling_price
      FROM purchase_items pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN product_variants pv ON pi.product_variant_id = pv.id
      LEFT JOIN product_batches pb ON pi.batch_id = pb.id
      WHERE pi.purchase_id = ${pid}
  `;
  console.log("Items for purchase", pid, ":", items);
}
run();
