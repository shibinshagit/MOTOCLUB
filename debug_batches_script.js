const { sql } = require("./lib/db");

async function checkBatches() {
  try {
    const batches = await sql`
      SELECT pb.id, pb.batch_no, pb.selling_price, pb.cost_price, pv.product_id, pv.name as variant_name, pbds.stock, pbds.device_id
      FROM product_batches pb
      LEFT JOIN product_variants pv ON pb.product_variant_id = pv.id
      LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id
      ORDER BY pb.id DESC
      LIMIT 10
    `;
    console.log(JSON.stringify(batches, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
checkBatches();
