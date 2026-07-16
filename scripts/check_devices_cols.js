const { sql } = require('../lib/db');

async function run() {
  try {
    const res = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'devices'
    `;
    console.log(res);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
