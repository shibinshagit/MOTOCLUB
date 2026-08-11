"use server"

import { sql } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"

// Ensure necessary database tables exist
export async function ensureSalaryTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS salary_payments (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL,
        company_id INTEGER DEFAULT 1,
        payment_month VARCHAR(20) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
        bonus DECIMAL(12,2) DEFAULT 0,
        advance_deduction DECIMAL(12,2) DEFAULT 0,
        other_deductions DECIMAL(12,2) DEFAULT 0,
        net_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'Bank Transfer',
        status VARCHAR(50) DEFAULT 'Approved',
        reference_number VARCHAR(100),
        notes TEXT,
        approved_by INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS staff_requests (
        id SERIAL PRIMARY KEY,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL,
        company_id INTEGER DEFAULT 1,
        request_type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) DEFAULT 0,
        start_date DATE,
        end_date DATE,
        leave_type VARCHAR(50),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        admin_remarks TEXT,
        approved_by INTEGER,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
  } catch (error) {
    console.error("Error initializing salary and request tables:", error)
  }
}

// Get payroll summary for all staff members of a device for a given month
export async function getStaffPayrollSummary(deviceId: number, month?: string) {
  noStore()
  await ensureSalaryTables()
  try {
    const targetMonth = month || new Date().toISOString().slice(0, 7) // 'YYYY-MM'

    // Fetch active staff for device
    const staffMembers = await sql`
      SELECT id, name, phone, email, role, position, salary, salary_date, joined_on, is_active
      FROM staff
      WHERE device_id = ${deviceId} AND is_active = true
      ORDER BY name ASC
    `

    // Fetch existing salary payments for this month
    const existingPayments = await sql`
      SELECT sp.*, s.name as staff_name
      FROM salary_payments sp
      JOIN staff s ON sp.staff_id = s.id
      WHERE sp.device_id = ${deviceId} AND sp.payment_month = ${targetMonth}
    `

    // Fetch pending/approved advances for each staff member
    const advances = await sql`
      SELECT staff_id, SUM(amount) as total_advance
      FROM staff_requests
      WHERE device_id = ${deviceId} AND request_type = 'salary_advance' AND status IN ('Approved', 'Paid')
      GROUP BY staff_id
    `

    const advanceMap: Record<number, number> = {}
    advances.forEach((adv: any) => {
      advanceMap[adv.staff_id] = Number(adv.total_advance) || 0
    })

    const paymentMap: Record<number, any> = {}
    existingPayments.forEach((pmt: any) => {
      paymentMap[pmt.staff_id] = pmt
    })

    const summary = staffMembers.map((member: any) => {
      const pmt = paymentMap[member.id]
      const advanceTaken = advanceMap[member.id] || 0
      const baseSalary = Number(member.salary) || 0

      return {
        staffId: member.id,
        name: member.name,
        position: member.position,
        phone: member.phone,
        baseSalary,
        salaryDate: member.salary_date ? (member.salary_date instanceof Date ? member.salary_date.toISOString().split("T")[0] : String(member.salary_date)) : "",
        advanceTaken,
        paymentStatus: pmt ? pmt.status : "Unpaid",
        paidAmount: pmt ? Number(pmt.net_salary) : 0,
        paymentDetails: pmt || null
      }
    })

    return {
      success: true,
      data: {
        month: targetMonth,
        summary,
        totalBaseSalary: summary.reduce((acc: number, item: any) => acc + item.baseSalary, 0),
        totalPaid: summary.reduce((acc: number, item: any) => acc + item.paidAmount, 0),
        totalAdvances: summary.reduce((acc: number, item: any) => acc + item.advanceTaken, 0)
      }
    }
  } catch (error: any) {
    console.error("getStaffPayrollSummary error:", error)
    return { success: false, message: error.message || "Failed to fetch payroll summary", data: null }
  }
}

// Create or record a salary payment
export async function createSalaryPayment(data: {
  staffId: number
  deviceId: number
  companyId?: number
  paymentMonth: string
  paymentDate: string
  baseSalary: number
  bonus: number
  advanceDeduction: number
  otherDeductions: number
  netSalary: number
  paymentMethod: string
  referenceNumber?: string
  notes?: string
  status?: string
}) {
  await ensureSalaryTables()
  try {
    const status = data.status || "Approved"
    const companyId = data.companyId || 1

    // Check if staff member exists
    const staffQuery = await sql`SELECT name FROM staff WHERE id = ${data.staffId} LIMIT 1`
    if (staffQuery.length === 0) {
      return { success: false, message: "Staff member not found" }
    }
    const staffName = staffQuery[0].name

    // Check if payment already exists for this staff and month
    const existing = await sql`
      SELECT id FROM salary_payments
      WHERE staff_id = ${data.staffId} AND payment_month = ${data.paymentMonth}
      LIMIT 1
    `

    let paymentId: number

    if (existing.length > 0) {
      paymentId = existing[0].id
      await sql`
        UPDATE salary_payments
        SET 
          payment_date = ${data.paymentDate},
          base_salary = ${data.baseSalary},
          bonus = ${data.bonus},
          advance_deduction = ${data.advanceDeduction},
          other_deductions = ${data.otherDeductions},
          net_salary = ${data.netSalary},
          payment_method = ${data.paymentMethod},
          status = ${status},
          reference_number = ${data.referenceNumber || null},
          notes = ${data.notes || null},
          updated_at = NOW()
        WHERE id = ${paymentId}
      `
    } else {
      const result = await sql`
        INSERT INTO salary_payments (
          staff_id, device_id, company_id, payment_month, payment_date,
          base_salary, bonus, advance_deduction, other_deductions, net_salary,
          payment_method, status, reference_number, notes, created_by
        )
        VALUES (
          ${data.staffId}, ${data.deviceId}, ${companyId}, ${data.paymentMonth}, ${data.paymentDate},
          ${data.baseSalary}, ${data.bonus}, ${data.advanceDeduction}, ${data.otherDeductions}, ${data.netSalary},
          ${data.paymentMethod}, ${status}, ${data.referenceNumber || null}, ${data.notes || null}, ${data.staffId}
        )
        RETURNING id
      `
      paymentId = result[0].id
    }

    // Automatically log an expense financial transaction if approved or paid
    if (status === "Approved" || status === "Paid") {
      const txName = `Salary Payout - ${staffName} (${data.paymentMonth})`
      await sql`
        INSERT INTO financial_transactions (
          transaction_date, transaction_type, transaction_name, category_name,
          reference_type, reference_id, amount, status, payment_method,
          description, notes, device_id, company_id, created_by
        )
        VALUES (
          ${data.paymentDate}, 'expense', ${txName}, 'Salary & Wages',
          'salary_payment', ${paymentId}, ${data.netSalary}, 'Completed', ${data.paymentMethod},
          ${`Base: ${data.baseSalary}, Bonus: ${data.bonus}, Advance Deduction: ${data.advanceDeduction}, Other Deductions: ${data.otherDeductions}`},
          ${data.notes || null}, ${data.deviceId}, ${companyId}, ${data.staffId}
        )
      `
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")
    return { success: true, message: `Salary payment recorded successfully for ${staffName}`, paymentId }
  } catch (error: any) {
    console.error("createSalaryPayment error:", error)
    return { success: false, message: error.message || "Failed to record salary payment" }
  }
}

// Update payment status (Approve / Verify / Reject)
export async function updateSalaryPaymentStatus(
  paymentId: number,
  status: "Pending Verification" | "Approved" | "Paid" | "Rejected",
  adminRemarks?: string
) {
  await ensureSalaryTables()
  try {
    const result = await sql`
      UPDATE salary_payments
      SET status = ${status}, notes = COALESCE(notes, '') || ${adminRemarks ? `\n[Admin Note]: ${adminRemarks}` : ''}, updated_at = NOW()
      WHERE id = ${paymentId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Salary payment record not found" }
    }

    const pmt = result[0]
    // Update linked financial transaction if exists
    if (status === "Approved" || status === "Paid") {
      await sql`
        UPDATE financial_transactions
        SET status = 'Completed'
        WHERE reference_type = 'salary_payment' AND reference_id = ${paymentId}
      `
    } else if (status === "Rejected") {
      await sql`
        UPDATE financial_transactions
        SET status = 'Cancelled'
        WHERE reference_type = 'salary_payment' AND reference_id = ${paymentId}
      `
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")
    return { success: true, message: `Salary status updated to ${status}` }
  } catch (error: any) {
    console.error("updateSalaryPaymentStatus error:", error)
    return { success: false, message: error.message || "Failed to update salary status" }
  }
}

// Get salary payment history
export async function getSalaryPaymentHistory(deviceId: number, staffId?: number) {
  noStore()
  await ensureSalaryTables()
  try {
    let targetStaffId = staffId
    if (!targetStaffId) {
      const session = await getStaffSession()
      if (session?.staffId) {
        targetStaffId = session.staffId
      }
    }

    let payments: any[] = []
    let advancePaidRequests: any[] = []

    if (targetStaffId) {
      payments = await sql`
        SELECT sp.*, s.name as staff_name, s.position
        FROM salary_payments sp
        JOIN staff s ON sp.staff_id = s.id
        WHERE sp.device_id = ${deviceId} AND sp.staff_id = ${targetStaffId}
        ORDER BY sp.payment_month DESC, sp.created_at DESC
      `
      advancePaidRequests = await sql`
        SELECT sr.id, sr.staff_id, sr.device_id, sr.amount, sr.status, sr.request_type, sr.reason as remarks, sr.created_at, sr.approved_at as payment_date, s.name as staff_name, s.position
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId} AND sr.staff_id = ${targetStaffId}
        AND sr.request_type IN ('salary_advance', 'credit_request')
        AND sr.status IN ('Paid', 'Approved')
        ORDER BY sr.created_at DESC
      `
    } else {
      payments = await sql`
        SELECT sp.*, s.name as staff_name, s.position
        FROM salary_payments sp
        JOIN staff s ON sp.staff_id = s.id
        WHERE sp.device_id = ${deviceId}
        ORDER BY sp.payment_month DESC, sp.created_at DESC
      `
      advancePaidRequests = await sql`
        SELECT sr.id, sr.staff_id, sr.device_id, sr.amount, sr.status, sr.request_type, sr.reason as remarks, sr.created_at, sr.approved_at as payment_date, s.name as staff_name, s.position
        FROM staff_requests sr
        JOIN staff s ON sr.staff_id = s.id
        WHERE sr.device_id = ${deviceId}
        AND sr.request_type IN ('salary_advance', 'credit_request')
        AND sr.status IN ('Paid', 'Approved')
        ORDER BY sr.created_at DESC
      `
    }

    const formattedPayments = payments.map((pmt: any) => ({
      ...pmt,
      payment_type: pmt.payment_type || "Regular Salary",
      payment_date: pmt.payment_date ? (pmt.payment_date instanceof Date ? pmt.payment_date.toISOString().split("T")[0] : String(pmt.payment_date)) : "",
      created_at: pmt.created_at ? (pmt.created_at instanceof Date ? pmt.created_at.toISOString() : String(pmt.created_at)) : "",
      updated_at: pmt.updated_at ? (pmt.updated_at instanceof Date ? pmt.updated_at.toISOString() : String(pmt.updated_at)) : ""
    }))

    const formattedAdvances = advancePaidRequests.map((req: any) => ({
      id: `req_${req.id}`,
      staff_id: req.staff_id,
      device_id: req.device_id,
      staff_name: req.staff_name,
      position: req.position,
      amount: req.amount,
      status: req.status,
      payment_type: req.request_type === "salary_advance" ? "Salary Advance (Paid)" : "Credit Request (Approved)",
      payment_date: req.payment_date ? (req.payment_date instanceof Date ? req.payment_date.toISOString().split("T")[0] : String(req.payment_date)) : (req.created_at instanceof Date ? req.created_at.toISOString().split("T")[0] : String(req.created_at)),
      created_at: req.created_at ? (req.created_at instanceof Date ? req.created_at.toISOString() : String(req.created_at)) : "",
      remarks: req.remarks || (req.request_type === "salary_advance" ? "Salary advance payout" : "Approved credit request")
    }))

    const combinedHistory = [...formattedPayments, ...formattedAdvances].sort(
      (a, b) => new Date(b.created_at || b.payment_date).getTime() - new Date(a.created_at || a.payment_date).getTime()
    )

    return { success: true, data: combinedHistory }
  } catch (error: any) {
    console.error("getSalaryPaymentHistory error:", error)
    return { success: false, message: error.message || "Failed to fetch salary history", data: [] }
  }
}
