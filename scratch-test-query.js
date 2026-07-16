require("dotenv").config({ path: ".env" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
async function run() {
  const deviceId = 2; // Testing for device 2
  const startDate = "2026-07-15";
  const endDate = "2026-07-15";
  
  const res = await sql`
      SELECT 
        a.id, 
        COALESCE(a.company_id, s.company_id) as company_id, 
        s.device_id, 
        s.id as staff_id, 
        d.date::text as date,
        a.check_in, a.check_out, a.working_minutes, a.late_minutes, 
        a.early_exit_minutes, a.overtime_minutes, a.status, a.remarks, a.shift_id,
        s.name as staff_name,
        s.phone as staff_phone,
        s.role as staff_role,
        dev.name as branch_name
      FROM staff s
      CROSS JOIN (SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval)::date AS date) d
      LEFT JOIN devices dev ON s.device_id = dev.id
      LEFT JOIN staff_attendance a ON s.id = a.staff_id AND a.date = d.date
      WHERE s.device_id = ${deviceId} 
        AND s.is_active = true
        AND s.role = 'staff'
      ORDER BY d.date DESC, s.name ASC
  `;
  console.log("Device 2:", res.length);
  
  const res4 = await sql`
      SELECT 
        a.id, 
        COALESCE(a.company_id, s.company_id) as company_id, 
        s.device_id, 
        s.id as staff_id, 
        d.date::text as date,
        s.name as staff_name
      FROM staff s
      CROSS JOIN (SELECT generate_series(${startDate}::date, ${endDate}::date, '1 day'::interval)::date AS date) d
      LEFT JOIN devices dev ON s.device_id = dev.id
      LEFT JOIN staff_attendance a ON s.id = a.staff_id AND a.date = d.date
      WHERE s.device_id = 4 
        AND s.is_active = true
        AND s.role = 'staff'
      ORDER BY d.date DESC, s.name ASC
  `;
  console.log("Device 4:", res4.length);
}
run();
