require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
async function run() {
  const tables = ['products', 'product_variants', 'product_batches', 'product_device_stock', 'product_batch_device_stock', 'purchase_items', 'sale_items', 'stock_transfer_items'];
  for (const t of tables) {
    const res = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ${t}`;
    console.log('TABLE:', t);
    console.table(res);
  }
}
run();
