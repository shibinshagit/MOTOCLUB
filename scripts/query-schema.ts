import { sql } from "../lib/db.ts";

async function run() {
  const tables = [
    'products',
    'product_variants',
    'product_batches',
    'product_batch_device_stock',
    'purchase_items',
    'sale_items',
    'product_stock_history',
    'product_device_stock'
  ];

  for (const table of tables) {
    const result = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = ${table}
      ORDER BY ordinal_position
    `;
    console.log(`\n--- ${table} ---`);
    console.table(result);
  }
  process.exit(0);
}

run().catch(console.error);
