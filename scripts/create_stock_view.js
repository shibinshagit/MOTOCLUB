require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function run() {
  try {
    console.log("Dropping old product_device_stock table...");
    await sql`DROP TABLE IF EXISTS product_device_stock CASCADE`;

    console.log("Creating product_device_stock VIEW...");
    await sql`
      CREATE VIEW product_device_stock AS
      SELECT 
        MIN(pbds.id) as id,
        pv.product_id,
        pb.product_variant_id,
        pbds.device_id,
        SUM(pbds.stock) as stock,
        MAX(pbds.updated_at) as updated_at
      FROM product_batch_device_stock pbds
      JOIN product_batches pb ON pbds.batch_id = pb.id
      JOIN product_variants pv ON pb.product_variant_id = pv.id
      GROUP BY pv.product_id, pb.product_variant_id, pbds.device_id
    `;
    console.log("Done!");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

run();
