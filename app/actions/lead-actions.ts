"use server"

import { sql } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { revalidatePath } from "next/cache"

export async function logLeadActivity(tx: any, params: {
  lead_id: number;
  company_id: number | null;
  staff_id: number;
  activity_type: string;
  old_status?: string;
  new_status?: string;
  old_assigned_to?: number;
  new_assigned_to?: number | null;
  note?: string;
}) {
  await tx`
    INSERT INTO crm_lead_activities (
      lead_id, company_id, staff_id, activity_type, old_status, new_status, old_assigned_to, new_assigned_to, note
    ) VALUES (
      ${params.lead_id}, ${params.company_id}, ${params.staff_id}, ${params.activity_type}, 
      ${params.old_status || null}, ${params.new_status || null}, 
      ${params.old_assigned_to || null}, ${params.new_assigned_to || null}, 
      ${params.note || null}
    )
  `
}

export async function getLeads(params: {
  page: number;
  search?: string;
  status?: string;
  assigned_filter?: string; // 'all', 'mine', 'unassigned'
  follow_up_filter?: string; // 'all', 'today', 'upcoming', 'overdue'
}) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized", records: [], total: 0 }

  const companyId = session.companyId
  const deviceId = session.deviceId

  const pageSize = 25
  const offset = (params.page - 1) * pageSize

  const searchObj = params.search ? `%${params.search}%` : null;
  
  const countResult = await sql`
    SELECT COUNT(l.id)
    FROM crm_leads l
    LEFT JOIN staff s ON l.assigned_to = s.id
    WHERE l.company_id = ${companyId} 
      AND (l.device_id IS NULL OR l.device_id = ${deviceId})
      AND (${searchObj}::text IS NULL OR (
        l.lead_number ILIKE ${searchObj} OR
        l.name ILIKE ${searchObj} OR
        l.phone ILIKE ${searchObj} OR
        l.email ILIKE ${searchObj} OR
        l.external_lead_id ILIKE ${searchObj} OR
        l.campaign ILIKE ${searchObj} OR
        l.source ILIKE ${searchObj}
      ))
      AND (${params.status && params.status !== "All" ? params.status : null}::text IS NULL OR l.status = ${params.status})
      AND (${params.assigned_filter === 'mine' ? session.staffId : null}::int IS NULL OR l.assigned_to = ${session.staffId})
      AND (${params.assigned_filter === 'unassigned' ? 1 : null}::int IS NULL OR l.assigned_to IS NULL)
      AND (${params.follow_up_filter === 'today' ? 1 : null}::int IS NULL OR DATE(l.next_follow_up_at AT TIME ZONE 'UTC') = CURRENT_DATE)
      AND (${params.follow_up_filter === 'upcoming' ? 1 : null}::int IS NULL OR l.next_follow_up_at > NOW())
      AND (${params.follow_up_filter === 'overdue' ? 1 : null}::int IS NULL OR (l.next_follow_up_at < NOW() AND l.status NOT IN ('Converted', 'Lost', 'Invalid')))
  `
  const total = Number(countResult[0].count)

  const records = await sql`
    SELECT 
      l.id, l.lead_number, l.name, l.phone, l.email, 
      l.source, l.campaign, l.status, l.created_at, l.next_follow_up_at,
      l.assigned_to, s.name as assigned_staff_name
    FROM crm_leads l
    LEFT JOIN staff s ON l.assigned_to = s.id
    WHERE l.company_id = ${companyId} 
      AND (l.device_id IS NULL OR l.device_id = ${deviceId})
      AND (${searchObj}::text IS NULL OR (
        l.lead_number ILIKE ${searchObj} OR
        l.name ILIKE ${searchObj} OR
        l.phone ILIKE ${searchObj} OR
        l.email ILIKE ${searchObj} OR
        l.external_lead_id ILIKE ${searchObj} OR
        l.campaign ILIKE ${searchObj} OR
        l.source ILIKE ${searchObj}
      ))
      AND (${params.status && params.status !== "All" ? params.status : null}::text IS NULL OR l.status = ${params.status})
      AND (${params.assigned_filter === 'mine' ? session.staffId : null}::int IS NULL OR l.assigned_to = ${session.staffId})
      AND (${params.assigned_filter === 'unassigned' ? 1 : null}::int IS NULL OR l.assigned_to IS NULL)
      AND (${params.follow_up_filter === 'today' ? 1 : null}::int IS NULL OR DATE(l.next_follow_up_at AT TIME ZONE 'UTC') = CURRENT_DATE)
      AND (${params.follow_up_filter === 'upcoming' ? 1 : null}::int IS NULL OR l.next_follow_up_at > NOW())
      AND (${params.follow_up_filter === 'overdue' ? 1 : null}::int IS NULL OR (l.next_follow_up_at < NOW() AND l.status NOT IN ('Converted', 'Lost', 'Invalid')))
    ORDER BY COALESCE(l.next_follow_up_at, l.created_at) DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `

  return {
    success: true,
    records,
    total,
    page: params.page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
}

export async function getLeadDetails(leadId: number) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  const lead = await sql`
    SELECT 
      l.*,
      s.name as assigned_staff_name
    FROM crm_leads l
    LEFT JOIN staff s ON l.assigned_to = s.id
    WHERE l.id = ${leadId}
      AND l.company_id = ${session.companyId}
      AND (l.device_id IS NULL OR l.device_id = ${session.deviceId})
    LIMIT 1
  `

  if (lead.length === 0) return { success: false, message: "Lead not found" }
  return { success: true, data: lead[0] }
}

export async function getLeadSummary() {
  const session = await getStaffSession()
  if (!session) return { success: false, data: {} }

  const summary = await sql`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_leads,
      SUM(CASE WHEN assigned_to = ${session.staffId} THEN 1 ELSE 0 END) as my_leads,
      SUM(CASE WHEN status = 'Follow Up' THEN 1 ELSE 0 END) as follow_up,
      SUM(CASE WHEN status = 'Interested' THEN 1 ELSE 0 END) as interested,
      SUM(CASE WHEN next_follow_up_at < NOW() AND status NOT IN ('Converted', 'Lost', 'Invalid') THEN 1 ELSE 0 END) as overdue
    FROM crm_leads
    WHERE company_id = ${session.companyId}
      AND (device_id IS NULL OR device_id = ${session.deviceId})
  `
  return { success: true, data: summary[0] }
}

export async function updateLeadStatus(leadId: number, status: string) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  const allowedStatuses = ['New', 'Assigned', 'Contacted', 'Follow Up', 'Interested', 'Converted', 'Lost', 'Invalid']
  if (!allowedStatuses.includes(status)) return { success: false, message: "Invalid status" }

  try {
    await sql.begin(async (tx: any) => {
      const old = await tx`SELECT status FROM crm_leads WHERE id = ${leadId} AND company_id = ${session.companyId} AND (device_id IS NULL OR device_id = ${session.deviceId})`
      if (old.length === 0) throw new Error("Not found")
      
      await tx`UPDATE crm_leads SET status = ${status}, updated_at = NOW() WHERE id = ${leadId}`
      await logLeadActivity(tx, {
        lead_id: leadId,
        company_id: session.companyId,
        staff_id: session.staffId,
        activity_type: 'STATUS_CHANGED',
        old_status: old[0].status,
        new_status: status
      })
    })
    revalidatePath("/dashboard")
    return { success: true, message: "Status updated" }
  } catch(e) {
    return { success: false, message: "Lead not found or unauthorized" }
  }
}

export async function updateLeadNotes(leadId: number, notes: string) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  try {
    await sql.begin(async (tx: any) => {
      const old = await tx`SELECT id FROM crm_leads WHERE id = ${leadId} AND company_id = ${session.companyId} AND (device_id IS NULL OR device_id = ${session.deviceId})`
      if (old.length === 0) throw new Error("Not found")
      
      await tx`UPDATE crm_leads SET notes = ${notes}, updated_at = NOW() WHERE id = ${leadId}`
      await logLeadActivity(tx, {
        lead_id: leadId,
        company_id: session.companyId,
        staff_id: session.staffId,
        activity_type: 'NOTE_ADDED'
      })
    })
    revalidatePath("/dashboard")
    return { success: true, message: "Notes updated" }
  } catch(e) {
    return { success: false, message: "Lead not found or unauthorized" }
  }
}

export async function setLeadFollowUp(leadId: number, date: string | null) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  try {
    await sql.begin(async (tx: any) => {
      const old = await tx`SELECT id FROM crm_leads WHERE id = ${leadId} AND company_id = ${session.companyId} AND (device_id IS NULL OR device_id = ${session.deviceId})`
      if (old.length === 0) throw new Error("Not found")
      
      await tx`UPDATE crm_leads SET next_follow_up_at = ${date}, updated_at = NOW() WHERE id = ${leadId}`
      await logLeadActivity(tx, {
        lead_id: leadId,
        company_id: session.companyId,
        staff_id: session.staffId,
        activity_type: date ? 'FOLLOW_UP_SET' : 'FOLLOW_UP_UPDATED',
        note: date ? `Follow-up set for ${new Date(date).toLocaleString()}` : 'Follow-up removed'
      })
    })
    revalidatePath("/dashboard")
    return { success: true, message: "Follow-up updated" }
  } catch(e) {
    return { success: false, message: "Lead not found or unauthorized" }
  }
}

export async function getCompanyStaff() {
  const session = await getStaffSession()
  if (!session) return { success: false, data: [] }
  
  const staff = await sql`
    SELECT id, name, role
    FROM staff
    WHERE company_id = ${session.companyId}
      AND device_id = ${session.deviceId}
      AND is_active = true
    ORDER BY name ASC
  `
  return { success: true, data: staff }
}

export async function assignLead(leadId: number, staffId: number | null) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  if (staffId !== null) {
    const checkStaff = await sql`
      SELECT id FROM staff 
      WHERE id = ${staffId} 
        AND company_id = ${session.companyId} 
        AND device_id = ${session.deviceId}
    `
    if (checkStaff.length === 0) return { success: false, message: "Invalid staff assignment" }
  }

  try {
    await sql.begin(async (tx: any) => {
      const old = await tx`SELECT assigned_to, status FROM crm_leads WHERE id = ${leadId} AND company_id = ${session.companyId} AND (device_id IS NULL OR device_id = ${session.deviceId})`
      if (old.length === 0) throw new Error("Not found")
      
      const newStatus = (old[0].status === 'New' && staffId !== null) ? 'Assigned' : old[0].status
      
      await tx`UPDATE crm_leads SET assigned_to = ${staffId}, status = ${newStatus}, updated_at = NOW() WHERE id = ${leadId}`
      await logLeadActivity(tx, {
        lead_id: leadId,
        company_id: session.companyId,
        staff_id: session.staffId,
        activity_type: staffId === null ? 'UNASSIGNED' : 'ASSIGNED',
        old_assigned_to: old[0].assigned_to,
        new_assigned_to: staffId,
        old_status: old[0].status,
        new_status: newStatus
      })
    })
    revalidatePath("/dashboard")
    return { success: true, message: staffId === null ? "Lead unassigned" : "Lead assigned successfully" }
  } catch(e) {
    return { success: false, message: "Lead not found or unauthorized" }
  }
}

export async function getLeadActivities(leadId: number) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  const activities = await sql`
    SELECT 
      a.*,
      s1.name as staff_name,
      s2.name as old_assigned_name,
      s3.name as new_assigned_name
    FROM crm_lead_activities a
    LEFT JOIN staff s1 ON a.staff_id = s1.id
    LEFT JOIN staff s2 ON a.old_assigned_to = s2.id
    LEFT JOIN staff s3 ON a.new_assigned_to = s3.id
    WHERE a.lead_id = ${leadId}
      AND a.company_id = ${session.companyId}
    ORDER BY a.created_at DESC
  `
  return { success: true, data: activities }
}

export async function convertLeadToCustomer(leadId: number) {
  const session = await getStaffSession()
  if (!session) return { success: false, message: "Unauthorized" }

  try {
    let resultCustomerId: number | null = null;
    let isAlreadyConverted = false;

    await sql.begin(async (tx: any) => {
      // 1. Lock and load lead
      const leads = await tx`
        SELECT id, name, phone, email, status, converted_customer_id
        FROM crm_leads 
        WHERE id = ${leadId} 
          AND company_id = ${session.companyId} 
          AND (device_id IS NULL OR device_id = ${session.deviceId})
        FOR UPDATE
      `
      if (leads.length === 0) throw new Error("Lead not found or unauthorized")
      
      const lead = leads[0];

      if (lead.converted_customer_id) {
        resultCustomerId = lead.converted_customer_id;
        isAlreadyConverted = true;
        return; // already converted
      }

      // 2. Try to match existing customer
      let customerId: number | null = null;
      
      if (lead.phone || lead.email) {
        const matches = await tx`
          SELECT id FROM customers 
          WHERE (created_by = ${session.companyId} OR created_by IN (SELECT id FROM devices WHERE company_id = ${session.companyId}))
            AND (
              (phone IS NOT NULL AND phone != '' AND phone = ${lead.phone}) 
              OR 
              (email IS NOT NULL AND email != '' AND email = ${lead.email})
            )
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        if (matches.length > 0) {
          customerId = matches[0].id;
        }
      }

      // 3. Create customer if not found
      if (!customerId) {
        const newCust = await tx`
          INSERT INTO customers (name, email, phone, created_by)
          VALUES (${lead.name}, ${lead.email || null}, ${lead.phone || null}, ${session.companyId})
          RETURNING id
        `;
        customerId = newCust[0].id;
      }

      resultCustomerId = customerId;

      // 4. Update lead
      await tx`
        UPDATE crm_leads 
        SET 
          converted_customer_id = ${customerId},
          status = 'Converted',
          converted_at = NOW(),
          updated_at = NOW()
        WHERE id = ${leadId}
      `;

      // 5. Activity log
      await logLeadActivity(tx, {
        lead_id: leadId,
        company_id: session.companyId,
        staff_id: session.staffId,
        activity_type: 'CUSTOMER_CONVERTED',
        old_status: lead.status,
        new_status: 'Converted',
        note: `Converted to Customer #${customerId}`
      });
    });

    revalidatePath("/dashboard");
    
    if (isAlreadyConverted) {
      return { success: true, alreadyConverted: true, customerId: resultCustomerId };
    }
    return { success: true, customerId: resultCustomerId };

  } catch (error: any) {
    console.error("convertLeadToCustomer error:", error)
    return { success: false, message: error.message || "Failed to convert lead" }
  }
}

