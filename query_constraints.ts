import { sql } from './lib/db';

async function main() {
  const result = await sql`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'product_device_stock'::regclass
  `;
  console.log(result);
  process.exit(0);
}
main();
