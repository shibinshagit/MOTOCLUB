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
          reference_type, reference_id, amount, debit_amount, status, payment_method,
          description, notes, device_id, company_id, created_by
        )
        VALUES (
          NOW(), 'expense', ${`Salary Advance Paid - ${staffName}`}, 'Salary & Wages',
          'salary_advance', ${requestId}, ${req.amount}, ${req.amount}, 'Completed', 'Cash',
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
export async function getStaffPurchaseDetails(staffId?: number, deviceId?: number) {
  noStore()
  try {
    const session = await getStaffSession()
    // Enforce authentication: staff role users can only fetch their own purchases
    const resolvedStaffId = (session?.role === 'staff')
      ? session.staffId
      : ((staffId && staffId > 0) ? staffId : session?.staffId)
    const resolvedDeviceId = deviceId || session?.deviceId

    if (!resolvedStaffId || !resolvedDeviceId) {
      return {
        success: false,
        message: "Staff ID and Device ID are required",
        data: {
          purchases: [],
          sales: [],
          totalPurchases: 0,
          directPaid: 0,
          salaryDeducted: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          totalSalesAmount: 0,
          totalOrdersCount: 0,
          totalAdvanceBalance: 0,
          totalCreditLimit: 0
        }
      }
    }

    // 1. Fetch staff info
    const staffInfo = await sql`SELECT id, name, phone FROM staff WHERE id = ${resolvedStaffId} LIMIT 1`
    const staffPhone = staffInfo[0]?.phone?.trim() || null
    const staffName = staffInfo[0]?.name?.trim() || null

    // 2. GENUINE STAFF PURCHASES (from sales table with sale_type = 'staff_purchase' OR payment_method IN ('Staff Account', 'Staff Credit', 'Staff Purchase'))
    const genuinePurchaseSales = await sql`
      SELECT s.*, 
        c.name as customer_name, c.phone as customer_phone, 
        st.name as staff_name,
        COALESCE(
          (
            SELECT STRING_AGG(
              CONCAT(
                COALESCE(p.name, sv.name, si.notes, 'Item'),
                CASE WHEN pv.name IS NOT NULL AND pv.name != '' THEN CONCAT(' - ', pv.name) ELSE '' END,
                ' × ',
                si.quantity
              ),
              ', '
            )
            FROM sale_items si 
            LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services s2 WHERE s2.id = si.product_id)
            LEFT JOIN services sv ON si.product_id = sv.id
            LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
            WHERE si.sale_id = s.id
          ),
          'Staff Purchase #' || s.id
        ) as product_names
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${resolvedDeviceId} 
        AND (s.staff_id = ${resolvedStaffId} OR s.created_by = ${resolvedStaffId})
        AND (
          s.sale_type = 'staff_purchase' 
          OR s.payment_method IN ('Staff Account', 'Staff Credit', 'Staff Purchase')
        )
      ORDER BY s.sale_date DESC
    `

    // 3. GENUINE STAFF PURCHASE REQUESTS (from staff_requests table with request_type IN ('credit_request', 'staff_purchase'))
    const genuinePurchaseRequests = await sql`
      SELECT sr.*, s.name as staff_name
      FROM staff_requests sr
      JOIN staff s ON sr.staff_id = s.id
      WHERE sr.device_id = ${resolvedDeviceId} 
        AND sr.staff_id = ${resolvedStaffId} 
        AND sr.request_type IN ('credit_request', 'staff_purchase')
      ORDER BY sr.created_at DESC
    `

    // 4. Fetch settlements history for genuine staff purchase sales
    const purchaseSaleIds = genuinePurchaseSales.map((s: any) => s.id)
    let purchaseSettlements: any[] = []
    if (purchaseSaleIds.length > 0) {
      purchaseSettlements = await sql`
        SELECT sps.*, s.name as staff_name, sp.payment_month as salary_month
        FROM staff_purchase_settlements sps
        LEFT JOIN staff s ON sps.staff_id = s.id
        LEFT JOIN salary_payments sp ON sps.salary_payment_id = sp.id
        WHERE sps.sale_id = ANY(${purchaseSaleIds})
        ORDER BY sps.created_at DESC
      `
    }

    const settlementsBySaleMap: Record<number, any[]> = {}
    purchaseSettlements.forEach((st: any) => {
      if (!settlementsBySaleMap[st.sale_id]) {
        settlementsBySaleMap[st.sale_id] = []
      }
      settlementsBySaleMap[st.sale_id].push({
        ...st,
        created_at: st.created_at ? (st.created_at instanceof Date ? st.created_at.toISOString() : String(st.created_at)) : ""
      })
    })

    // Process genuine staff purchase sales into formatted list
    let directPaid = 0
    let salaryDeducted = 0

    const formattedPurchaseSales = genuinePurchaseSales.map((s: any) => {
      const saleSettlements = settlementsBySaleMap[s.id] || []
      const sDirectPaid = saleSettlements
        .filter((st: any) => st.settlement_type === "direct_payment")
        .reduce((sum: number, st: any) => sum + (Number(st.amount) || 0), 0)
      const sSalaryDeducted = saleSettlements
        .filter((st: any) => st.settlement_type === "salary_deduction")
        .reduce((sum: number, st: any) => sum + (Number(st.amount) || 0), 0)

      const sTotalSettled = sDirectPaid + sSalaryDeducted
      const saleTotal = Number(s.total_amount) || 0
      const sOutstanding = Math.max(0, saleTotal - sTotalSettled)

      directPaid += sDirectPaid
      salaryDeducted += sSalaryDeducted

      let paymentStatus = "Pending"
      if (s.status === "Cancelled") {
        paymentStatus = "Cancelled"
      } else if (sTotalSettled >= saleTotal - 0.01) {
        paymentStatus = "Paid"
      } else if (sTotalSettled > 0) {
        paymentStatus = "Partially Paid"
      } else if (s.status === "Approved") {
        paymentStatus = "Approved"
      }

      return {
        ...s,
        id: s.id,
        tracking_id: s.tracking_id || `SP-${String(s.id).padStart(4, '0')}`,
        total_amount: saleTotal,
        direct_paid: sDirectPaid,
        salary_deducted: sSalaryDeducted,
        paid_amount: sTotalSettled,
        outstanding_amount: sOutstanding,
        payment_status: paymentStatus,
        settlements: saleSettlements,
        sale_date: s.sale_date ? (s.sale_date instanceof Date ? s.sale_date.toISOString() : String(s.sale_date)) : "",
        created_at: s.created_at ? (s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)) : ""
      }
    })

    // Process genuine staff purchase requests (that are not already recorded as sales)
    const formattedPurchaseRequests = genuinePurchaseRequests
      .filter((req: any) => !genuinePurchaseSales.some((s: any) => s.external_order_id === `REQ-${req.id}`))
      .map((req: any) => {
        const reqAmount = Number(req.amount) || 0
        const isRejected = req.status === "Rejected"
        const isPaid = req.status === "Paid"
        const isApproved = req.status === "Approved"
        const outstanding = isRejected ? 0 : (isPaid ? 0 : reqAmount)

        return {
          id: req.id,
          tracking_id: `SP-REQ-${String(req.id).padStart(4, '0')}`,
          product_names: req.reason || "Staff Purchase Request",
          total_amount: reqAmount,
          direct_paid: isPaid ? reqAmount : 0,
          salary_deducted: 0,
          paid_amount: isPaid ? reqAmount : 0,
          outstanding_amount: outstanding,
          payment_status: req.status || "Pending",
          settlements: [],
          sale_date: req.created_at ? (req.created_at instanceof Date ? req.created_at.toISOString() : String(req.created_at)) : "",
          created_at: req.created_at ? (req.created_at instanceof Date ? req.created_at.toISOString() : String(req.created_at)) : "",
          is_request: true
        }
      })

    // Combined genuine staff purchases list
    const genuinePurchases = [...formattedPurchaseSales, ...formattedPurchaseRequests]

    const totalPurchases = genuinePurchases.reduce(
      (acc: number, item: any) => item.payment_status === "Rejected" || item.payment_status === "Cancelled" ? acc : acc + item.total_amount,
      0
    )
    const totalPaid = directPaid + salaryDeducted
    const outstandingBalance = genuinePurchases.reduce(
      (acc: number, item: any) => item.payment_status === "Rejected" || item.payment_status === "Cancelled" ? acc : acc + item.outstanding_amount,
      0
    )

    // 5. CUSTOMER SALES & JOB CARDS HANDLED BY STAFF (for Admin Profile Modal & Staff Activity view)
    const staffSales = await sql`
      SELECT s.*, 
        c.name as customer_name, c.phone as customer_phone, 
        st.name as staff_name,
        COALESCE(
          (
            SELECT STRING_AGG(
              CONCAT(
                COALESCE(p.name, sv.name, si.notes, 'Item'),
                CASE WHEN pv.name IS NOT NULL AND pv.name != '' THEN CONCAT(' - ', pv.name) ELSE '' END,
                ' × ',
                si.quantity
              ),
              ', '
            )
            FROM sale_items si 
            LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services s2 WHERE s2.id = si.product_id)
            LEFT JOIN services sv ON si.product_id = sv.id
            LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
            WHERE si.sale_id = s.id
          ),
          'Order #' || s.id
        ) as product_names
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${resolvedDeviceId} AND (
        s.staff_id = ${resolvedStaffId} 
        OR s.created_by = ${resolvedStaffId}
      )
      ORDER BY s.sale_date DESC
      LIMIT 100
    `

    const formattedSales = staffSales.map((s: any) => ({
      ...s,
      total_amount: Number(s.total_amount) || 0,
      sale_date: s.sale_date ? (s.sale_date instanceof Date ? s.sale_date.toISOString() : String(s.sale_date)) : "",
      created_at: s.created_at ? (s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at)) : ""
    }))

    const totalSalesAmount = formattedSales.reduce((acc: number, item: any) => acc + item.total_amount, 0)
    const totalOrdersCount = formattedSales.length

    // 6. Approved advances and credits
    const activeAdvances = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM staff_requests
      WHERE staff_id = ${resolvedStaffId} AND request_type = 'salary_advance' AND status IN ('Approved', 'Paid')
    `

    const activeCredits = await sql`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM staff_requests
      WHERE staff_id = ${resolvedStaffId} AND request_type = 'credit_request' AND status = 'Approved'
    `

    return {
      success: true,
      data: {
        purchases: genuinePurchases,
        sales: formattedSales,
        totalPurchases,
        directPaid,
        salaryDeducted,
        totalPaid,
        outstandingBalance,
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
      data: {
        purchases: [],
        sales: [],
        totalPurchases: 0,
        directPaid: 0,
        salaryDeducted: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        totalSalesAmount: 0,
        totalOrdersCount: 0,
        totalAdvanceBalance: 0,
        totalCreditLimit: 0
      }
    }
  }
}

// Record a direct payment for a staff purchase
export async function recordStaffPurchaseDirectPayment(data: {
  saleId: number
  amount: number
  paymentMethod: string
  referenceNumber?: string
  notes?: string
}) {
  await ensureSalaryTables()
  try {
    const session = await getStaffSession()
    if (!session?.staffId) {
      return { success: false, message: "Unauthorized staff session" }
    }

    if (!data.amount || data.amount <= 0) {
      return { success: false, message: "Payment amount must be greater than 0" }
    }

    const saleQuery = await sql`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ${data.saleId} LIMIT 1
    `
    if (saleQuery.length === 0) {
      return { success: false, message: "Staff purchase record not found" }
    }
    const sale = saleQuery[0]

    // Calculate current settled amount
    const settlements = await sql`
      SELECT COALESCE(SUM(amount), 0) as settled
      FROM staff_purchase_settlements
      WHERE sale_id = ${data.saleId}
    `
    const alreadySettled = Number(settlements[0]?.settled) || 0
    const saleTotal = Number(sale.total_amount) || 0
    const currentOutstanding = Math.max(0, saleTotal - alreadySettled)

    if (data.amount > currentOutstanding + 0.01) {
      return {
        success: false,
        message: `Payment amount (${data.amount}) cannot exceed current outstanding balance (${currentOutstanding.toFixed(2)})`
      }
    }

    const staffId = sale.staff_id || session.staffId
    const deviceId = sale.device_id || session.deviceId

    // Insert direct payment settlement
    await sql`
      INSERT INTO staff_purchase_settlements (
        sale_id, staff_id, settlement_type, amount,
        payment_method, reference_number, notes, created_by
      )
      VALUES (
        ${data.saleId}, ${staffId}, 'direct_payment', ${data.amount},
        ${data.paymentMethod || 'Cash'}, ${data.referenceNumber || null},
        ${data.notes || 'Direct payment on staff purchase'}, ${session.staffId}
      )
    `

    const newTotalSettled = alreadySettled + data.amount
    const newStatus = newTotalSettled >= saleTotal - 0.01 ? "Paid" : "Partially Paid"

    await sql`
      UPDATE sales
      SET received_amount = ${newTotalSettled}, status = ${newStatus}, updated_at = NOW()
      WHERE id = ${data.saleId}
    `

    // Log income financial transaction
    await sql`
      INSERT INTO financial_transactions (
        transaction_date, transaction_type, transaction_name, category_name,
        reference_type, reference_id, amount, credit_amount, status, payment_method,
        description, notes, device_id, created_by
      )
      VALUES (
        NOW(), 'income', ${`Staff Purchase Payment - Order #${sale.id}`}, 'Staff Receivables',
        'staff_purchase_payment', ${sale.id}, ${data.amount}, ${data.amount}, 'Completed', ${data.paymentMethod || 'Cash'},
        ${`Direct payment recorded for staff purchase #${sale.id}`}, ${data.notes || null}, ${deviceId}, ${session.staffId}
      )
    `

    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")
    return {
      success: true,
      message: `Direct payment of ₹${data.amount.toFixed(2)} recorded successfully. New outstanding: ₹${Math.max(0, saleTotal - newTotalSettled).toFixed(2)}`
    }
  } catch (error: any) {
    console.error("recordStaffPurchaseDirectPayment error:", error)
    return { success: false, message: error.message || "Failed to record payment" }
  }
}
