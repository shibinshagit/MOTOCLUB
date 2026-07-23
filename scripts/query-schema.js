import { sql } from "./lib/db";

async function run() {
  const result = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'product_batches'
  `;
  console.log("BATCH COLUMNS:", result);
}

run().catch(console.error);
