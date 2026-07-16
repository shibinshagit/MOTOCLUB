import { sql } from '../lib/db';

async function run() {
  try {
    const res = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products'
    `;
    console.log(res.map((r: any) => r.column_name).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
