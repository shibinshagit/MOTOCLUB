"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { getStaffSession } from "@/lib/staff-session"

export interface AttendanceRecord {
  id: number
  company_id: number | null
  device_id: number
  staff_id: number
  date: Date | string
  check_in: Date | string | null
  check_out: Date | string | null
  working_minutes: number
  late_minutes: number
  early_exit_minutes: number
  overtime_minutes: number
  status: string
  remarks: string | null
  shift_id: number | null
  staff_name?: string
  staff_phone?: string
  staff_role?: string
  branch_name?: string
}

export async function checkIn(staffId: number, deviceId: number, companyId: number | null) {
  try {
    // Check if attendance already exists for today
    const existing = await sql`
      SELECT id, check_in FROM staff_attendance
      WHERE staff_id = ${staffId} AND date = CURRENT_DATE
    `

    if (existing.length > 0) {
      return { success: true, message: "Already checked in today" }
    }

    await sql`
      INSERT INTO staff_attendance (
        company_id, device_id, staff_id, date, check_in, status
      ) VALUES (
        ${companyId}, ${deviceId}, ${staffId}, CURRENT_DATE, CURRENT_TIMESTAMP, 'Present'
      )
    `

    return { success: true, message: "Checked in successfully" }
  } catch (error) {
    console.error("Check-in error:", error)
    return { success: false, message: "Failed to check in" }
  }
}

export async function checkOut(staffId: number, deviceId: number) {
  try {
    const existing = await sql`
      SELECT id, check_in, check_out FROM staff_attendance
      WHERE staff_id = ${staffId} AND date = CURRENT_DATE
    `

    if (existing.length === 0) {
      return { success: false, message: "No check-in record found for today" }
    }

    const attendance = existing[0]

    // If already checked out and we want to just return, uncomment below.
    // However, it's safer to always update check_out time on logout
    // if (attendance.check_out) return { success: true, message: "Already checked out" }

    if (!attendance.check_in) {
      return { success: false, message: "Cannot checkout without check-in time" }
    }

    // Calculate working minutes
    const checkInTime = new Date(attendance.check_in).getTime()
    const checkOutTime = Date.now()
    const workingMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60))

    // Note: Future Shift Management will calculate late_minutes, early_exit_minutes, and overtime_minutes here

    await sql`
      UPDATE staff_attendance
      SET 
        check_out = CURRENT_TIMESTAMP,
        working_minutes = ${workingMinutes},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${attendance.id}
    `

    return { success: true, message: "Checked out successfully" }
  } catch (error) {
    console.error("Check-out error:", error)
    return { success: false, message: "Failed to check out" }
  }
}

export async function getFilteredAttendance(
  deviceId: number,
  filters: {
    startDate: string
    endDate: string
    staffId?: string
    status?: string
  }
) {
  try {
    noStore() // Fix Issue 2: Ensure fresh data on every request, bypassing Next.js server action caching
    
    // Unified query prioritizing Staff table as base, LEFT JOINing attendance to ensure staff are never hidden
    let attendance = await sql`
      SELECT 
        s.id as staff_id, 
        COALESCE(a.company_id, s.company_id) as company_id, 
        s.device_id, 
        a.id, 
        COALESCE(a.date::text, ${filters.startDate}::text) as date,
        a.check_in, a.check_out, a.working_minutes, a.late_minutes, 
        a.early_exit_minutes, a.overtime_minutes, a.status, a.remarks, a.shift_id,
        s.name as staff_name,
        s.phone as staff_phone,
        s.role as staff_role,
        dev.name as branch_name
      FROM staff s
      LEFT JOIN devices dev ON s.device_id = dev.id
      LEFT JOIN staff_attendance a 
        ON s.id = a.staff_id 
        AND a.date >= ${filters.startDate}::date 
        AND a.date <= ${filters.endDate}::date
      WHERE s.device_id = ${deviceId} 
        AND s.is_active = true
        AND s.role IN ('staff', 'admin')
      ORDER BY s.name ASC, a.date DESC
    `

    // Apply filters in memory
    if (filters.staffId && filters.staffId.toLowerCase() !== "all") {
      attendance = attendance.filter((a: any) => String(a.staff_id) === String(filters.staffId))
    }

    console.log(`[ATTENDANCE QUERY] DeviceID: ${deviceId}, Filters:`, filters);
    console.log(`[ATTENDANCE QUERY] Fetched Staff Count = ${attendance.length}`);
    if (attendance.length > 0) {
      console.log(`[ATTENDANCE QUERY] First Staff:`, attendance[0].staff_name, attendance[0].staff_id);
    }

    // Apply status filter in memory since derived statuses (like "Absent" if check_in is null) are easier here
    if (filters.status && filters.status !== "All") {
      attendance = attendance.filter((a: any) => {
        const currentStatus = a.status || (a.check_in ? 'Present' : 'Absent')
        return currentStatus === filters.status
      })
    }

    const summary = {
      total: attendance.length,
      present: attendance.filter((a: any) => (a.status === 'Present' || (a.check_in && !a.status))).length,
      notCheckedIn: attendance.filter((a: any) => (!a.check_in && !a.status)).length,
      absent: attendance.filter((a: any) => a.status === 'Absent').length,
      leave: attendance.filter((a: any) => a.status === 'Leave').length,
      late: attendance.filter((a: any) => a.late_minutes > 0 || a.status === 'Late').length,
    }

    return { success: true, data: attendance as AttendanceRecord[], summary }
  } catch (error) {
    console.error("Fetch attendance error:", error)
    return { success: false, message: "Failed to fetch attendance records" }
  }
}

export async function updateAttendanceStatus(
  id: number,
  staffId: number,
  deviceId: number,
  companyId: number | null,
  date: string,
  updateData: {
    check_in?: string | null
    check_out?: string | null
    status?: string
    remarks?: string
  }
) {
  try {
    // If id exists, update
    if (id) {
      let workingMinutes = 0

      // Calculate working minutes if check_in and check_out are provided
      if (updateData.check_in && updateData.check_out) {
        const checkInTime = new Date(updateData.check_in).getTime()
        const checkOutTime = new Date(updateData.check_out).getTime()
        workingMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60))
        if (workingMinutes < 0) workingMinutes = 0
      }

      await sql`
        UPDATE staff_attendance
        SET 
          check_in = ${updateData.check_in !== undefined ? updateData.check_in : sql`check_in`},
          check_out = ${updateData.check_out !== undefined ? updateData.check_out : sql`check_out`},
          status = ${updateData.status !== undefined ? updateData.status : sql`status`},
          remarks = ${updateData.remarks !== undefined ? updateData.remarks : sql`remarks`},
          working_minutes = ${workingMinutes},
          marked_by_admin_id = ${deviceId},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `
    } else {
      // Manual entry where no record exists yet
      let workingMinutes = 0
      if (updateData.check_in && updateData.check_out) {
        const checkInTime = new Date(updateData.check_in).getTime()
        const checkOutTime = new Date(updateData.check_out).getTime()
        workingMinutes = Math.floor((checkOutTime - checkInTime) / (1000 * 60))
        if (workingMinutes < 0) workingMinutes = 0
      }

      await sql`
        INSERT INTO staff_attendance (
          company_id, device_id, staff_id, date, check_in, check_out, working_minutes, status, remarks, marked_by_admin_id
        ) VALUES (
          ${companyId}, ${deviceId}, ${staffId}, ${date}, 
          ${updateData.check_in || null}, ${updateData.check_out || null}, 
          ${workingMinutes}, ${updateData.status || 'Present'}, ${updateData.remarks || null}, ${deviceId}
        )
      `
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Attendance updated successfully" }
  } catch (error) {
    console.error("Update attendance error:", error)
    return { success: false, message: "Failed to update attendance" }
  }
}

export async function getStaffAttendanceHistory(staffId: number, startDate: string, endDate: string) {
  try {
    const attendance = await sql`
      SELECT * FROM staff_attendance
      WHERE staff_id = ${staffId} 
      AND date >= ${startDate} AND date <= ${endDate}
      ORDER BY date DESC
    `
    return { success: true, data: attendance as AttendanceRecord[] }
  } catch (error) {
    console.error("Fetch staff attendance history error:", error)
    return { success: false, message: "Failed to fetch attendance history" }
  }
}

export async function getMyAttendance(month: number, year: number) {
  try {
    const session = await getStaffSession()
    if (!session) return { success: false, message: "Unauthorized" }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`

    const history = await sql`
      SELECT * FROM staff_attendance
      WHERE staff_id = ${session.staffId} 
      AND date >= ${startDate} AND date <= ${endDate}
      ORDER BY date DESC
    `

    const todayStr = new Date().toISOString().split("T")[0]
    const todayRecord = history.find((r: any) => {
      // date from DB could be Date object or string.
      const d = typeof r.date === 'string' ? r.date.split("T")[0] : new Date(r.date).toISOString().split("T")[0]
      return d === todayStr
    })

    return { success: true, data: history as AttendanceRecord[], today: todayRecord as AttendanceRecord }
  } catch (error) {
    console.error("Fetch my attendance error:", error)
    return { success: false, message: "Failed to fetch attendance" }
  }
}
