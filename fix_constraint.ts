import { sql } from './lib/db'

async function fixConstraint() {
  try {
    console.log('Cleaning up duplicates in product_device_stock...')
    await sql`
      DELETE FROM product_device_stock
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER(PARTITION BY product_id, device_id ORDER BY updated_at DESC) as row_num
          FROM product_device_stock
        ) t
        WHERE t.row_num > 1
      )
    `
    console.log('Duplicates removed.')

    console.log('Adding UNIQUE constraint to product_device_stock...')
    // Check if constraint exists first, or just drop and add
    try {
      await sql`ALTER TABLE product_device_stock DROP CONSTRAINT IF EXISTS product_device_stock_product_id_device_id_key`
      await sql`ALTER TABLE product_device_stock ADD CONSTRAINT product_device_stock_product_id_device_id_key UNIQUE (product_id, device_id)`
      console.log('Constraint added successfully.')
    } catch (err: any) {
      console.error('Error adding constraint:', err.message)
    }
  } catch (err) {
    console.error('Error:', err)
  }
  process.exit(0)
}

fixConstraint()
