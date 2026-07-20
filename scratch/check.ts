import { sql } from '../lib/db';
async function run() {
  const res = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'sale_items'`;
  console.log(res);
  process.exit(0);
}
run();
