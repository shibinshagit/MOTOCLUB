import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "@/lib/db";
import { addSale } from "@/app/actions/sale-actions";
import { addPurchase } from "@/app/actions/purchase-actions";

async function testScenario() {
  console.log("=== Setting up test data ===");
  // Create a product
  const productRes = await sql`
    INSERT INTO products (name, sku, category_id, type)
    VALUES ('Test Battery', 'BAT-123', 1, 'simple')
    RETURNING id
  `;
  const productId = productRes[0].id;
  
  // Set batch managed flag
  await sql`UPDATE products SET is_batch_managed = true WHERE id = ${productId}`;

  // Get first device ID
  const deviceRes = await sql`SELECT id FROM devices LIMIT 1`;
  const deviceId = deviceRes[0].id;

  console.log(`Created product ${productId} on device ${deviceId}`);

  // Create Purchase 1 for BATCH-001 (Qty 20, Cost 450)
  console.log("Creating Purchase 1...");
  await addPurchase({
    supplierId: 1,
    deviceId: deviceId,
    status: "received",
    items: [{
      productId,
      quantity: 20,
      price: 450,
      batch_number: "BATCH-001"
    }]
  });

  // Create Purchase 2 for BATCH-002 (Qty 15, Cost 500)
  console.log("Creating Purchase 2...");
  await addPurchase({
    supplierId: 1,
    deviceId: deviceId,
    status: "received",
    items: [{
      productId,
      quantity: 15,
      price: 500,
      batch_number: "BATCH-002"
    }]
  });

  // Fetch batches
  const batches = await sql`SELECT * FROM product_batches WHERE product_id = ${productId} ORDER BY id ASC`;
  const batch1 = batches[0];
  const batch2 = batches[1];
  console.log(`Created batches: ${batch1.batch_number} (ID: ${batch1.id}), ${batch2.batch_number} (ID: ${batch2.id})`);

  // Verify stock before sale
  const stockBefore = await sql`
    SELECT batch_id, stock FROM product_batch_device_stock 
    WHERE batch_id IN (${batch1.id}, ${batch2.id})
  `;
  console.log("Stock before sale:", stockBefore);

  // Perform Sale of Qty 5 from BATCH-002
  console.log("Performing Sale of 5 units from BATCH-002...");
  await addSale({
    customerId: 1,
    deviceId: deviceId,
    staffId: 1,
    status: "completed",
    currency: "QAR",
    paymentStatus: "paid",
    items: [{
      productId,
      quantity: 5,
      price: 550,
      cost: 500,
      batchId: batch2.id
    }]
  });

  // Verify stock after sale
  const stockAfter = await sql`
    SELECT pb.batch_number, pbds.stock 
    FROM product_batch_device_stock pbds
    JOIN product_batches pb ON pbds.batch_id = pb.id
    WHERE batch_id IN (${batch1.id}, ${batch2.id})
    ORDER BY pb.batch_number
  `;
  console.log("Stock after sale:");
  console.table(stockAfter);

  if (stockAfter.find((s: any) => s.batch_number === "BATCH-001")?.stock !== 20) {
    console.error("FAILED: BATCH-001 stock should be 20");
    process.exit(1);
  }
  if (stockAfter.find((s: any) => s.batch_number === "BATCH-002")?.stock !== 10) {
    console.error("FAILED: BATCH-002 stock should be 10");
    process.exit(1);
  }
  
  console.log("SUCCESS! Scenario completed correctly.");
  process.exit(0);
}

testScenario().catch(console.error);
