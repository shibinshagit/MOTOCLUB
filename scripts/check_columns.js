require('dotenv').config({path: '.env.local'});
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.POSTGRES_URL);

async function run() {
  try {
    const res = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products'
    `;
    console.log(res.map(r => r.column_name).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
