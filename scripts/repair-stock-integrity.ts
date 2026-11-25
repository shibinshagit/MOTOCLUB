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
  await sql.begin(async (tx) => {
    // product_batch_device_stock is the source of truth. This makes the legacy
    // batch counter a derived cache that cannot be independently maintained.
    await tx.unsafe(`
      CREATE OR REPLACE FUNCTION sync_product_batch_remaining_quantity()
      RETURNS TRIGGER AS $$
      DECLARE affected_batch_id INTEGER;
      BEGIN
        affected_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);
        UPDATE product_batches
        SET remaining_quantity = COALESCE((
          SELECT SUM(stock)
          FROM product_batch_device_stock
          WHERE batch_id = affected_batch_id
        ), 0), updated_at = NOW()
        WHERE id = affected_batch_id;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `)
    await tx.unsafe(`
      DROP TRIGGER IF EXISTS product_batch_stock_sync_remaining_quantity
      ON product_batch_device_stock;
    `)
    await tx.unsafe(`
      CREATE TRIGGER product_batch_stock_sync_remaining_quantity
      AFTER INSERT OR UPDATE OF stock OR DELETE
      ON product_batch_device_stock
      FOR EACH ROW EXECUTE FUNCTION sync_product_batch_remaining_quantity();
    `)
    await tx.unsafe(`
      UPDATE product_batches pb
      SET remaining_quantity = COALESCE((
        SELECT SUM(pbds.stock)
        FROM product_batch_device_stock pbds
        WHERE pbds.batch_id = pb.id
      ), 0), updated_at = NOW();
    `)

    // Backfill 0-cost adjustment batches with variant/product wholesale price & selling price
    await tx.unsafe(`
      UPDATE product_batches pb
      SET
        cost_price = COALESCE(
          NULLIF(pv.cost_price, 0),
          NULLIF(pv.wholesale_price, 0),
          NULLIF(p.wholesale_price, 0),
          0
        ),
        selling_price = COALESCE(
          NULLIF(pv.price, 0),
          NULLIF(pv.msp, 0),
          NULLIF(p.price, 0),
          0
        ),
        updated_at = NOW()
      FROM products p
      LEFT JOIN product_variants pv ON pv.id = pb.product_variant_id
      WHERE pb.product_id = p.id
        AND pb.batch_no LIKE 'ADJ-%'
        AND COALESCE(pb.cost_price, 0) = 0;
    `)
  })

  console.log("Rebuilt all derived batch quantities, backfilled 0-cost adjustment batches, and installed the ledger synchronization trigger.")
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => sql.end({ timeout: 5 }))
