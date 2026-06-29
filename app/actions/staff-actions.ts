"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  DEFAULT_STAFF_VALUE_RESTRICTIONS,
  parseStringArray,
  type StaffPageId,
  type StaffValueRestriction,
} from "@/lib/staff-restrictions"
import { clearStaffSessionCookie, setStaffSessionCookie } from "@/lib/staff-session"

async function generatePasswordHash(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

function normalizeStaffRole(role?: string): "admin" | "staff" {
  return role === "admin" ? "admin" : "staff"
}

function normalizeRestrictedPages(pages?: StaffPageId[]): StaffPageId[] {
  return parseStringArray<StaffPageId>(pages)
}

function normalizeRestrictedValues(
  role: "admin" | "staff",
  values?: StaffValueRestriction[],
): StaffValueRestriction[] {
  if (role === "admin") return []
  const parsed = parseStringArray<StaffValueRestriction>(values)
  return parsed.length > 0 ? parsed : [...DEFAULT_STAFF_VALUE_RESTRICTIONS]
}

function normalizeRestrictedValuesForUpdate(
  role: "admin" | "staff",
  values?: StaffValueRestriction[],
): StaffValueRestriction[] {
  if (role === "admin") return []
  return parseStringArray<StaffValueRestriction>(values)
}

// Schema is managed by `npm run migrate`
export async function getDeviceStaff(deviceId: number) {
  try {


    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error fetching staff:", error)
    return { success: false, message: "Failed to fetch staff", data: [] }
  }
}

// Get only active staff for a device
export async function getActiveStaff(deviceId: number) {
  try {


    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId} AND is_active = true
      ORDER BY name ASC
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error fetching active staff:", error)
    return { success: false, message: "Failed to fetch active staff", data: [] }
  }
}

// Update staff member
export async function updateStaff(
  staffId: number,
  staffData: {
    name: string
    phone: string
    email?: string
    role?: "admin" | "staff"
    restrictedPages?: StaffPageId[]
    restrictedValues?: StaffValueRestriction[]
    position: string
    salary: number
    salaryDate: string
    joinedOn: string
    age?: number
    idCardNumber?: string
    address?: string
    deviceId: number
    password?: string
    isActive?: boolean
  },
) {
  try {
    // Validate required IDs
    if (!staffData.deviceId || staffData.deviceId === null || staffData.deviceId === undefined) {
      console.error("❌ Device ID is missing or null:", staffData.deviceId)
      return { success: false, message: "Device ID is required" }
    }

    if (!staffId || staffId === null || staffId === undefined) {
      console.error("❌ Staff ID is missing or null:", staffId)
      return { success: false, message: "Staff ID is required" }
    }



    // Check if staff member exists and belongs to the device
    const existingStaff = await sql`
      SELECT id, name FROM staff 
      WHERE id = ${staffId} AND device_id = ${staffData.deviceId}
      LIMIT 1
    `

    if (existingStaff.length === 0) {
      return { success: false, message: "Staff member not found or access denied" }
    }

    const newPasswordHash =
      staffData.password && staffData.password.trim().length > 0
        ? await generatePasswordHash(staffData.password.trim())
        : null

    const role = normalizeStaffRole(staffData.role)
    const restrictedPages = normalizeRestrictedPages(staffData.restrictedPages)
    const restrictedValues = normalizeRestrictedValuesForUpdate(role, staffData.restrictedValues)
    const isActive = staffData.isActive !== false

    if (!isActive) {
      const activeCount = await sql`
        SELECT COUNT(*)::int AS count
        FROM staff
        WHERE device_id = ${staffData.deviceId}
          AND is_active = true
          AND id != ${staffId}
      `
      if (activeCount[0].count === 0) {
        return { success: false, message: "At least one staff member must remain active." }
      }
    }

    // Update the staff member
    const result = await sql`
      UPDATE staff SET
        name = ${staffData.name},
        phone = ${staffData.phone},
        email = ${staffData.email || null},
        role = ${role},
        restricted_pages = ${JSON.stringify(restrictedPages)}::jsonb,
        restricted_values = ${JSON.stringify(restrictedValues)}::jsonb,
        position = ${staffData.position},
        salary = ${staffData.salary},
        salary_date = ${staffData.salaryDate},
        joined_on = ${staffData.joinedOn},
        age = ${staffData.age || null},
        id_card_number = ${staffData.idCardNumber || null},
        address = ${staffData.address || null},
        is_active = ${isActive},
        staff_password_hash = COALESCE(${newPasswordHash}, staff_password_hash),
        updated_at = NOW()
      WHERE id = ${staffId} AND device_id = ${staffData.deviceId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Failed to update staff member" }
    }

    console.log("✅ Staff member updated successfully:", result[0])
    revalidatePath("/dashboard")
    revalidatePath("/admin", "layout")

    return {
      success: true,
      data: result[0],
      message: `${result[0].name} updated successfully`,
    }
  } catch (error) {
    console.error("❌ Error updating staff:", error)
    return { success: false, message: `Failed to update staff member: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Activate staff (does not deactivate others — multiple staff can be active)
export async function activateStaff(staffId: number, deviceId: number) {
  try {
    // Enable selected staff without changing others (multi-active support)
    const result = await sql`
      UPDATE staff 
      SET is_active = true, updated_at = NOW()
      WHERE id = ${staffId} AND device_id = ${deviceId}
      RETURNING *
    `

    if (result.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    // Get all updated staff data to return
    const allStaff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    revalidatePath("/dashboard")
    return {
      success: true,
      data: result[0],
      allStaff: allStaff,
      message: `${result[0].name} is now active`,
    }
  } catch (error) {
    console.error("Error activating staff:", error)
    return { success: false, message: "Failed to activate staff member" }
  }
}

// Add a new staff member
export async function addStaff(staffData: {
  name: string
  phone: string
  email?: string
  role?: "admin" | "staff"
  restrictedPages?: StaffPageId[]
  restrictedValues?: StaffValueRestriction[]
  position: string
  salary: number
  salaryDate: string
  joinedOn: string
  age?: number
  idCardNumber?: string
  address?: string
  deviceId: number
  userId?: number
  password: string
  isActive?: boolean
}) {
  try {
    // Validate required IDs
    if (!staffData.deviceId || staffData.deviceId === null || staffData.deviceId === undefined) {
      console.error("❌ Device ID is missing or null:", staffData.deviceId)
      return { success: false, message: "Device ID is required" }
    }

    if (!staffData.password || !staffData.password.trim()) {
      return { success: false, message: "Staff password is required" }
    }

    const createdBy = staffData.userId || staffData.deviceId
    const staffPasswordHash = await generatePasswordHash(staffData.password.trim())


    // New staff is active by default unless explicitly disabled
    const isActive = staffData.isActive !== false

    const role = normalizeStaffRole(staffData.role)
    const restrictedPages = normalizeRestrictedPages(staffData.restrictedPages)
    const restrictedValues = normalizeRestrictedValues(role, staffData.restrictedValues)

    const result = await sql`
      INSERT INTO staff (
        name, phone, email, role, restricted_pages, restricted_values, position, salary, salary_date, joined_on, 
        age, id_card_number, address, device_id, created_by, is_active, staff_password_hash
      ) VALUES (
        ${staffData.name},
        ${staffData.phone},
        ${staffData.email || null},
        ${role},
        ${JSON.stringify(restrictedPages)}::jsonb,
        ${JSON.stringify(restrictedValues)}::jsonb,
        ${staffData.position},
        ${staffData.salary},
        ${staffData.salaryDate},
        ${staffData.joinedOn},
        ${staffData.age || null},
        ${staffData.idCardNumber || null},
        ${staffData.address || null},
        ${staffData.deviceId},
        ${createdBy},
        ${isActive},
        ${staffPasswordHash}
      ) RETURNING *
    `

    console.log("✅ Staff member created successfully:", result[0])
    revalidatePath("/dashboard")

    const message = "Staff member added and activated successfully"

    return { success: true, data: result[0], message }
  } catch (error) {
    console.error("❌ Error adding staff:", error)
    return { success: false, message: `Failed to add staff member: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function getStaffForAuthentication(deviceId: number) {
  try {
    const staff = await sql`
      SELECT id, name, position, role, is_active, restricted_pages, restricted_values
      FROM staff
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error fetching staff for authentication:", error)
    return { success: false, message: "Failed to fetch staff members", data: [] }
  }
}

export async function authenticateStaff(
  staffId: number,
  deviceId: number,
  password: string,
) {
  try {
    if (!password?.trim()) {
      return { success: false, message: "Staff password is required" }
    }

    const passwordHash = await generatePasswordHash(password.trim())
    const staffResult = await sql`
      SELECT *
      FROM staff
      WHERE id = ${staffId}
        AND device_id = ${deviceId}
        AND is_active = true
      LIMIT 1
    `

    if (staffResult.length === 0) {
      return { success: false, message: "Staff not found or inactive" }
    }

    const staff = staffResult[0]
    if (!staff.staff_password_hash || staff.staff_password_hash !== passwordHash) {
      return { success: false, message: "Invalid staff password" }
    }

    const activateResult = await activateStaff(staffId, deviceId)
    if (!activateResult.success) {
      return { success: false, message: activateResult.message || "Failed to activate staff session" }
    }

    await setStaffSessionCookie(deviceId, staffId)

    return {
      success: true,
      message: "Staff authenticated successfully",
      data: activateResult.data,
      allStaff: activateResult.allStaff,
    }
  } catch (error) {
    console.error("Error authenticating staff:", error)
    return { success: false, message: "Failed to authenticate staff" }
  }
}

// Search staff
export async function searchStaff(deviceId: number, searchTerm: string) {
  try {
    const searchPattern = `%${searchTerm.toLowerCase()}%`

    const staff = await sql`
      SELECT * FROM staff 
      WHERE device_id = ${deviceId} 
        AND is_active = true
        AND (
          LOWER(name) LIKE ${searchPattern}
          OR LOWER(phone) LIKE ${searchPattern}
          OR LOWER(position) LIKE ${searchPattern}
        )
      ORDER BY name ASC
      LIMIT 20
    `

    return { success: true, data: staff }
  } catch (error) {
    console.error("Error searching staff:", error)
    return { success: false, message: "Failed to search staff", data: [] }
  }
}

// Get staff by ID
export async function getStaffById(staffId: number, deviceId: number) {
  try {
    const result = await sql`
      SELECT * FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    if (result.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error fetching staff:", error)
    return { success: false, message: "Failed to fetch staff member" }
  }
}

// Delete staff member (soft delete)
export async function deleteStaff(staffId: number, deviceId: number) {
  try {
    // Check if this is the only staff member
    const staffCount = await sql`
      SELECT COUNT(*) as count FROM staff 
      WHERE device_id = ${deviceId}
    `

    if (staffCount[0].count <= 1) {
      return {
        success: false,
        message: "Cannot delete the only staff member.",
      }
    }

    // Check if this is the active staff
    const staffToDelete = await sql`
      SELECT is_active, name FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    if (staffToDelete.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    const wasActive = staffToDelete[0].is_active

    // Delete the staff member
    await sql`
      DELETE FROM staff 
      WHERE id = ${staffId} AND device_id = ${deviceId}
    `

    // If we deleted the active staff, activate the first remaining staff
    if (wasActive) {
      const remainingStaff = await sql`
        SELECT id FROM staff 
        WHERE device_id = ${deviceId}
        ORDER BY name ASC
        LIMIT 1
      `

      if (remainingStaff.length > 0) {
        await sql`
          UPDATE staff 
          SET is_active = true, updated_at = NOW()
          WHERE id = ${remainingStaff[0].id}
        `
      }
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Staff member deleted successfully" }
  } catch (error) {
    console.error("Error deleting staff:", error)
    return { success: false, message: "Failed to delete staff member" }
  }
}

// Toggle staff active status (multiple staff can be active at once)
export async function updateStaffStatus(staffId: number, deviceId: number, isActive: boolean) {
  try {
    const existingStaff = await sql`
      SELECT id, is_active FROM staff
      WHERE id = ${staffId} AND device_id = ${deviceId}
      LIMIT 1
    `

    if (existingStaff.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    if (!isActive) {
      const activeCount = await sql`
        SELECT COUNT(*)::int AS count
        FROM staff
        WHERE device_id = ${deviceId}
          AND is_active = true
          AND id != ${staffId}
      `
      if (activeCount[0].count === 0) {
        return {
          success: false,
          message: "At least one staff member must remain active.",
        }
      }
    }

    const result = await sql`
      UPDATE staff
      SET is_active = ${isActive}, updated_at = NOW()
      WHERE id = ${staffId} AND device_id = ${deviceId}
      RETURNING *
    `

    const allStaff = await sql`
      SELECT * FROM staff
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    revalidatePath("/dashboard")

    return {
      success: true,
      data: result[0],
      allStaff,
      message: isActive ? "Staff member activated" : "Staff member deactivated",
    }
  } catch (error) {
    console.error("Error updating staff status:", error)
    return { success: false, message: "Failed to update staff status" }
  }
}

export async function restoreStaffSession(staffId: number, deviceId: number) {
  try {

    const staff = await sql`
      SELECT id, name, position, role, is_active, restricted_pages, restricted_values
      FROM staff
      WHERE id = ${staffId}
        AND device_id = ${deviceId}
      LIMIT 1
    `

    if (staff.length === 0) {
      return { success: false, message: "Staff member not found" }
    }

    if (!staff[0].is_active) {
      return { success: false, message: "Staff member is inactive" }
    }

    await setStaffSessionCookie(deviceId, staffId)

    const allStaff = await sql`
      SELECT id, name, position, role, is_active, restricted_pages, restricted_values
      FROM staff
      WHERE device_id = ${deviceId}
      ORDER BY is_active DESC, name ASC
    `

    return {
      success: true,
      data: staff[0],
      allStaff,
    }
  } catch (error) {
    console.error("Error restoring staff session:", error)
    return { success: false, message: "Failed to restore staff session" }
  }
}

export async function clearStaffSession(deviceId: number) {
  try {
    await clearStaffSessionCookie(deviceId)
    return { success: true }
  } catch (error) {
    console.error("Error clearing staff session:", error)
    return { success: false, message: "Failed to clear staff session" }
  }
}
