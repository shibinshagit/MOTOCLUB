"use server"

import { sql } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { ensureSalaryTables } from "./salary-actions"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"

// Submit a staff request (Advance, Credit, Leave)
export async function createStaffRequest(data: {
  staffId?: number
  deviceId?: number
  companyId?: number
  requestType: "salary_advance" | "credit_request" | "leave_request"
  amount?: number
  startDate?: string
  endDate?: string
  leaveType?: string
  reason: string
}) {
  await ensureSalaryTables()
  try {
    const session = await getStaffSession()
    const staffId = data.staffId || session?.staffId
    const deviceId = data.deviceId || session?.deviceId

    if (!staffId || !deviceId) {
      return { success: false, message: "Staff ID and Device ID are required" }
    }

    if (!data.reason?.trim()) {
      return { success: false, message: "Reason for request is required" }
    }

    if ((data.requestType === "salary_advance" || data.requestType === "credit_request") && (!data.amount || data.amount <= 0)) {
      return { success: false, message: "Please specify a valid requested amount" }
    }

    if (data.requestType === "leave_request" && (!data.startDate || !data.endDate)) {
      return { success: false, message: "Start date and end date are required for leave requests" }
    }

    const companyId = data.companyId || session?.companyId || 1

    const result = await sql`
      INSERT INTO staff_requests (
        staff_id, device_id, company_id, request_type, amount,
        start_date, end_date, leave_type, reason, status
      )
      VALUES (
        ${staffId}, ${deviceId}, ${companyId}, ${data.requestType}, ${data.amount || 0},
        ${data.startDate || null}, ${data.endDate || null}, ${data.leaveType || null}, ${data.reason}, 'Pending'
      )
      RETURNING id
    `

    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")
    return { success: true, message: "Request submitted successfully. Waiting for admin approval.", requestId: result[0].id }
  } catch (error: any) {
    console.error("createStaffRequest error:", error)
    return { success: false, message: error.message || "Failed to submit request" }
  }
}

// Get staff requests with optional filters
export async function getStaffRequests(params: {
  deviceId?: number
  staffId?: number
  requestType?: string
  status?: string
}) {
  noStore()
  await ensureSalaryTables()
  try {
    const session = await getStaffSession()
    const deviceId = params.deviceId || session?.deviceId
    const staffId = params.staffId || (session?.role === 'staff' ? session.staffId : undefined)

    if (!deviceId) {
      return { success: false, message: "Device ID is required", data: [] }
    }

    let query: any[]

    if (staffId && params.requestType && params.status) {
      query = await sql`
        SELECT sr.*, s.name as staff_name, s.position, s.phone
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId} AND sr.staff_id = ${staffId} AND sr.request_type = ${params.requestType} AND sr.status = ${params.status}
        ORDER BY sr.created_at DESC
      `
    } else if (staffId && params.requestType) {
      query = await sql`
        SELECT sr.*, s.name as staff_name, s.position, s.phone
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId} AND sr.staff_id = ${staffId} AND sr.request_type = ${params.requestType}
        ORDER BY sr.created_at DESC
      `
    } else if (staffId) {
      query = await sql`
        SELECT sr.*, s.name as staff_name, s.position, s.phone
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId} AND sr.staff_id = ${staffId}
        ORDER BY sr.created_at DESC
      `
    } else if (params.requestType) {
      query = await sql`
        SELECT sr.*, s.name as staff_name, s.position, s.phone
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId} AND sr.request_type = ${params.requestType}
        ORDER BY sr.created_at DESC
      `
    } else {
      query = await sql`
        SELECT sr.*, s.name as staff_name, s.position, s.phone
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId}
        ORDER BY sr.created_at DESC
      `
    }

    const formattedRequests = query.map((req: any) => ({
      ...req,
      start_date: req.start_date ? (req.start_date instanceof Date ? req.start_date.toISOString().split("T")[0] : String(req.start_date)) : "",
      end_date: req.end_date ? (req.end_date instanceof Date ? req.end_date.toISOString().split("T")[0] : String(req.end_date)) : "",
      created_at: req.created_at ? (req.created_at instanceof Date ? req.created_at.toISOString() : String(req.created_at)) : "",
      updated_at: req.updated_at ? (req.updated_at instanceof Date ? req.updated_at.toISOString() : String(req.updated_at)) : ""
    }))

    return { success: true, data: formattedRequests }
  } catch (error: any) {
    console.error("getStaffRequests error:", error)
    return { success: false, message: error.message || "Failed to fetch requests", data: [] }
  }
}

// Update staff request status (Approve / Reject / Mark Paid)
export async function updateStaffRequestStatus(
  requestId: number,
  status: "Approved" | "Rejected" | "Paid",
  adminRemarks?: string
) {
  await ensureSalaryTables()
  try {
    const session = await getStaffSession()
    const approvedBy = session?.staffId || null

    const reqQuery = await sql`SELECT * FROM staff_requests WHERE id = ${requestId} LIMIT 1`
    if (reqQuery.length === 0) {
      return { success: false, message: "Request not found" }
    }
    const req = reqQuery[0]

    await sql`
      UPDATE staff_requests
      SET 
        status = ${status},
        admin_remarks = ${adminRemarks || null},
        approved_by = ${approvedBy},
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = ${requestId}
    `

    // If leave request approved, add attendance records for dates
    if (req.request_type === "leave_request" && status === "Approved" && req.start_date && req.end_date) {
      try {
        const start = new Date(req.start_date)
        const end = new Date(req.end_date)
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0]
          await sql`
            INSERT INTO staff_attendance (
              company_id, device_id, staff_id, date, status, notes
            )
            VALUES (
              ${req.company_id}, ${req.device_id}, ${req.staff_id}, ${dateStr}, 'Leave', ${req.reason || 'Leave Approved'}
            )
            ON CONFLICT (staff_id, date) DO UPDATE
            SET status = 'Leave', notes = EXCLUDED.notes
          `
        }
      } catch (attErr) {
        console.warn("Failed to auto-update attendance for leave request:", attErr)
      }
    }

    // If salary advance marked paid, record financial transaction
    if (req.request_type === "salary_advance" && (status === "Paid" || status === "Approved")) {
      const staffInfo = await sql`SELECT name FROM staff WHERE id = ${req.staff_id} LIMIT 1`
      const staffName = staffInfo[0]?.name || "Staff Member"

      await sql`
        INSERT INTO financial_transactions (
          transaction_date, transaction_type, transaction_name, category_name,
          reference_type, reference_id, amount, status, payment_method,
          description, notes, device_id, company_id, created_by
        )
        VALUES (
          NOW(), 'expense', ${`Salary Advance Paid - ${staffName}`}, 'Salary & Wages',
          'salary_advance', ${requestId}, ${req.amount}, 'Completed', 'Cash',
          ${`Salary advance requested on ${new Date(req.created_at).toLocaleDateString()}`},
          ${adminRemarks || null}, ${req.device_id}, ${req.company_id}, ${req.staff_id}
        )
      `
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")
    return { success: true, message: `Request status updated to ${status}` }
  } catch (error: any) {
    console.error("updateStaffRequestStatus error:", error)
    return { success: false, message: error.message || "Failed to update request status" }
  }
}

// Get purchases / sales details for staff member
export async function getStaffPurchaseDetails(staffId: number, deviceId: number) {
  noStore()
  try {
    // 1. Sales & Job cards handled by staff
    const staffSales = await sql`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, st.name as staff_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId} AND s.staff_id = ${staffId}
      ORDER BY s.sale_date DESC
      LIMIT 100
    `

    // 2. Summary stats
    const totalSalesAmount = staffSales.reduce((acc: number, item: any) => acc + (Number(item.total_amount) || 0), 0)
    const totalOrdersCount = staffSales.length

    // 3. Approved advances and credits
    const activeAdvances = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM staff_requests
      WHERE staff_id = ${staffId} AND request_type = 'salary_advance' AND status IN ('Approved', 'Paid')
    `

    const activeCredits = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM staff_requests
      WHERE staff_id = ${staffId} AND request_type = 'credit_request' AND status = 'Approved'
    `

    const formattedSales = staffSales.map((s: any) => ({
      ...s,
      sale_date: s.sale_date ? (s.sale_date instanceof Date ? s.sale_date.toISOString() : String(s.sale_date)) : "",
      created_at: s.created_at ? (s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)) : ""
    }))

    return {
      success: true,
      data: {
        sales: formattedSales,
        totalSalesAmount,
        totalOrdersCount,
        totalAdvanceBalance: Number(activeAdvances[0]?.total) || 0,
        totalCreditLimit: Number(activeCredits[0]?.total) || 0
      }
    }
  } catch (error: any) {
    console.error("getStaffPurchaseDetails error:", error)
    return {
      success: false,
      message: error.message || "Failed to fetch staff purchase details",
      data: { sales: [], totalSalesAmount: 0, totalOrdersCount: 0, totalAdvanceBalance: 0, totalCreditLimit: 0 }
    }
  }
}
