import "dotenv/config"
import postgres from "postgres"

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_POSTGRES_URL ||
  process.env.NEON_POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL

if (!databaseUrl) throw new Error("No database URL configured")

const sql = postgres(databaseUrl, { max: 1 })

async function run() {
  const [schema, negativeBatchStock, batchDrift, orphanStock, legacyStock] = await Promise.all([
    sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('product_batches', 'product_batch_device_stock', 'product_device_stock', 'product_stock_history')
      ORDER BY table_name, ordinal_position
    `,
    sql`
      SELECT pbds.batch_id, pbds.device_id, pbds.stock
      FROM product_batch_device_stock pbds
      WHERE pbds.stock < 0
    `,
    sql`
      SELECT pb.id, pb.batch_no, pb.remaining_quantity,
             COALESCE(SUM(pbds.stock), 0) AS device_stock_total
      FROM product_batches pb
      LEFT JOIN product_batch_device_stock pbds ON pbds.batch_id = pb.id
      GROUP BY pb.id, pb.batch_no, pb.remaining_quantity
      HAVING pb.remaining_quantity IS NOT NULL
         AND pb.remaining_quantity <> COALESCE(SUM(pbds.stock), 0)
    `,
    sql`
      SELECT pbds.batch_id, pbds.device_id
      FROM product_batch_device_stock pbds
      LEFT JOIN product_batches pb ON pb.id = pbds.batch_id
      WHERE pb.id IS NULL
    `,
    sql`
      SELECT pds.product_id, pds.device_id, pds.product_variant_id, pds.stock,
             COALESCE(batch_totals.stock, 0) AS batch_stock
      FROM product_device_stock pds
      LEFT JOIN LATERAL (
        SELECT SUM(pbds.stock) AS stock
        FROM product_batch_device_stock pbds
        JOIN product_batches pb ON pb.id = pbds.batch_id
        WHERE pbds.device_id = pds.device_id
          AND pb.product_id = pds.product_id
          AND (pds.product_variant_id IS NULL OR pb.product_variant_id = pds.product_variant_id)
      ) batch_totals ON true
      WHERE pds.stock <> COALESCE(batch_totals.stock, 0)
    `,
  ])

  console.log(JSON.stringify({
    schema,
    negativeBatchStock,
    batchDrift,
    orphanStock,
    legacyStock,
    summary: {
      negativeBatchStock: negativeBatchStock.length,
      batchDrift: batchDrift.length,
      orphanStock: orphanStock.length,
      legacyStock: legacyStock.length,
    },
  }, null, 2))
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => sql.end({ timeout: 5 }))
