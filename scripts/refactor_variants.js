require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log("Starting refactor migration...");

  try {
    // 1. ADD COLUMNS to product_variants
    await sql`ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS minimum_stock INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mrp DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS msp DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shelf VARCHAR(255),
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`;

    // 2. ADD COLUMNS to product_batches
    await sql`ALTER TABLE product_batches
      ADD COLUMN IF NOT EXISTS purchase_id INTEGER,
      ADD COLUMN IF NOT EXISTS purchase_item_id INTEGER,
      ADD COLUMN IF NOT EXISTS supplier_id INTEGER,
      ADD COLUMN IF NOT EXISTS quantity_purchased INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS remaining_quantity INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`;

    // 3. GENERATE DEFAULT VARIANTS FOR ALL PRODUCTS WITHOUT VARIANTS
    const productsWithoutVariants = await sql`
      SELECT p.* FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE pv.id IS NULL
    `;
    console.log(`Found ${productsWithoutVariants.length} products without variants. creating defaults...`);
    
    for (const p of productsWithoutVariants) {
      await sql`
        INSERT INTO product_variants (
          product_id, name, barcode, shelf, cost_price, mrp, msp, price, status
        ) VALUES (
          ${p.id},
          'Default',
          ${p.barcode || null},
          ${p.shelf || null},
          ${p.wholesale_price || 0},
          ${p.price || 0},
          ${p.msp || 0},
          ${p.price || 0},
          'active'
        )
      `;
    }

    // 4. PORT DATA FOR EXISTING VARIANTS
    await sql`
      UPDATE product_variants pv
      SET mrp = p.price,
          msp = p.msp,
          cost_price = p.wholesale_price
      FROM products p
      WHERE pv.product_id = p.id AND (pv.mrp IS NULL OR pv.mrp = 0)
    `;
    await sql`
      UPDATE product_variants pv
      SET barcode = p.barcode
      FROM products p
      WHERE pv.product_id = p.id AND (pv.barcode IS NULL OR TRIM(pv.barcode) = '') AND p.barcode IS NOT NULL
    `;
    await sql`
      UPDATE product_variants pv
      SET shelf = p.shelf
      FROM products p
      WHERE pv.product_id = p.id AND (pv.shelf IS NULL OR TRIM(pv.shelf) = '') AND p.shelf IS NOT NULL
    `;

    // 5. MIGRATE STOCK from product_device_stock -> product_batch_device_stock via "MIGRATION-BATCH"
    const oldStocks = await sql`SELECT * FROM product_device_stock WHERE stock > 0`;
    console.log(`Migrating ${oldStocks.length} stock entries...`);
    
    for (const s of oldStocks) {
      let variantId = s.product_variant_id;
      if (!variantId) {
        const variants = await sql`SELECT id FROM product_variants WHERE product_id = ${s.product_id} ORDER BY id ASC LIMIT 1`;
        if (variants.length > 0) variantId = variants[0].id;
      }
      
      if (variantId) {
        // Create a batch
        const batch = await sql`
          INSERT INTO product_batches (
            product_variant_id, batch_no, cost_price, selling_price, quantity_purchased, remaining_quantity
          ) VALUES (
            ${variantId}, 'MIG-' || ${s.id}, 0, 0, ${s.stock}, ${s.stock}
          ) RETURNING id
        `;
        
        // Insert into product_batch_device_stock
        await sql`
          INSERT INTO product_batch_device_stock (
            batch_id, device_id, stock
          ) VALUES (
            ${batch[0].id}, ${s.device_id}, ${s.stock}
          )
        `;
      }
    }
    
    await sql`TRUNCATE product_device_stock`;

    // 6. BACKFILL purchase_items and sale_items and stock_transfer_items with variant_id if missing
    console.log("Backfilling transaction tables...");
    await sql`
      UPDATE sale_items si
      SET product_variant_id = (
        SELECT id FROM product_variants pv WHERE pv.product_id = si.product_id ORDER BY id ASC LIMIT 1
      )
      WHERE product_variant_id IS NULL;
    `;
    
    await sql`
      UPDATE purchase_items pi
      SET product_variant_id = (
        SELECT id FROM product_variants pv WHERE pv.product_id = pi.product_id ORDER BY id ASC LIMIT 1
      )
      WHERE product_variant_id IS NULL;
    `;

    await sql`
      UPDATE stock_transfer_items sti
      SET product_variant_id = (
        SELECT id FROM product_variants pv WHERE pv.product_id = sti.product_id ORDER BY id ASC LIMIT 1
      )
      WHERE product_variant_id IS NULL;
    `;
    
    await sql`
      UPDATE sale_items si
      SET batch_id = (
        SELECT id FROM product_batches pb WHERE pb.product_variant_id = si.product_variant_id ORDER BY id ASC LIMIT 1
      )
      WHERE batch_id IS NULL;
    `;
    
    await sql`
      UPDATE purchase_items pi
      SET batch_id = (
        SELECT id FROM product_batches pb WHERE pb.product_variant_id = pi.product_variant_id ORDER BY id ASC LIMIT 1
      )
      WHERE batch_id IS NULL;
    `;

    await sql`
      UPDATE stock_transfer_items sti
      SET batch_id = (
        SELECT id FROM product_batches pb WHERE pb.product_variant_id = sti.product_variant_id ORDER BY id ASC LIMIT 1
      )
      WHERE batch_id IS NULL;
    `;
    
    // 7. DROP COLUMNS from products
    console.log("Dropping old columns from products...");
    await sql`ALTER TABLE products
      DROP COLUMN IF EXISTS price,
      DROP COLUMN IF EXISTS wholesale_price,
      DROP COLUMN IF EXISTS msp,
      DROP COLUMN IF EXISTS barcode,
      DROP COLUMN IF EXISTS shelf,
      DROP COLUMN IF EXISTS color,
      DROP COLUMN IF EXISTS size,
      DROP COLUMN IF EXISTS stock`;

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    process.exit(0);
  }
}

run();
