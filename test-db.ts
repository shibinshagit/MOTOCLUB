import { sql } from "@/lib/db"

async function test() {
  console.log("Checking product_batches...");
  const batches = await sql`SELECT id, product_id, product_variant_id, remaining_quantity FROM product_batches LIMIT 5`;
  console.log("Batches:", batches);
  
  const deviceStocks = await sql`SELECT * FROM product_batch_device_stock LIMIT 5`;
  console.log("Device Stocks:", deviceStocks);

  const stockWithVariants = await sql`
    SELECT pv.product_id, SUM(pbds.stock) as stock
    FROM product_batch_device_stock pbds
    JOIN product_batches pb ON pb.id = pbds.batch_id
    JOIN product_variants pv ON pb.product_variant_id = pv.id
    GROUP BY pv.product_id
    LIMIT 5
  `;
  console.log("Stock with variants:", stockWithVariants);
  
  const stockWithBatches = await sql`
    SELECT pb.product_id, SUM(pbds.stock) as stock
    FROM product_batch_device_stock pbds
    JOIN product_batches pb ON pb.id = pbds.batch_id
    GROUP BY pb.product_id
    LIMIT 5
  `;
  console.log("Stock with batches:", stockWithBatches);

  process.exit(0);
}

test().catch(console.error);
