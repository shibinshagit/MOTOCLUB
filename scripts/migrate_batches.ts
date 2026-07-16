import { sql } from '../lib/db';

async function run() {
  try {
    const res = await sql`
      UPDATE product_batches 
      SET batch_no = 'BATCH-' || LPAD(id::text, 3, '0') 
      WHERE batch_no IS NULL OR TRIM(batch_no) = ''
    `;
    console.log('Updated rows:', res.count);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
