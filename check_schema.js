const { sql } = require('./lib/db');
async function test() {
  try {
    const result = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'product_batches'`;
    console.log(result.map(r => r.column_name));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
test();
