"use server"

import { sql } from "@/lib/db"
import { setStaffSessionCookie, clearStaffSessionCookie, getStaffSession } from "@/lib/staff-session"

async function generatePasswordHash(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function staffLogin(formData: FormData) {
  try {
    const phone = formData.get("phone") as string
    const password = formData.get("password") as string

    if (!phone?.trim() || !password) {
      return {
        success: false,
        message: "Phone number and password are required",
      }
    }

    const password_hash = await generatePasswordHash(password)

    // Find staff member and join with their assigned device
    const result = await sql`
      SELECT 
        s.id as staff_id,
        s.name as staff_name,
        s.phone,
        s.role,
        s.is_active as staff_active,
        s.restricted_pages,
        s.restricted_values,
        d.id as device_id,
        d.company_id,
        d.is_active as device_active
      FROM staff s
      LEFT JOIN devices d ON s.device_id = d.id
      WHERE s.phone = ${phone} AND s.staff_password_hash = ${password_hash}
      LIMIT 1
    `

    if (result.length === 0) {
      return {
        success: false,
        message: "Invalid phone number or password",
      }
    }

    const staff = result[0]

    // Ensure staff account is active
    if (!staff.staff_active) {
      return {
        success: false,
        message: "Your staff account has been deactivated. Please contact your admin.",
      }
    }

    // Ensure the device/branch they belong to is also active
    if (staff.device_id && !staff.device_active) {
      return {
        success: false,
        message: "Your assigned branch/device is currently inactive.",
      }
    }

    // Safe parse the JSONb restrictions
    let restricted_pages: string[] = []
    let restricted_values: string[] = []
    
    try {
      restricted_pages = typeof staff.restricted_pages === 'string' 
        ? JSON.parse(staff.restricted_pages) 
        : (staff.restricted_pages || [])
        
      restricted_values = typeof staff.restricted_values === 'string' 
        ? JSON.parse(staff.restricted_values) 
        : (staff.restricted_values || [])
    } catch (e) {
      console.warn("Failed to parse staff restrictions during login", e)
    }

    // Set secure JWT session
    await setStaffSessionCookie({
      staff_id: staff.staff_id,
      company_id: staff.company_id,
      device_id: staff.device_id,
      role: staff.role,
      permissions: {
        restricted_pages,
        restricted_values,
      },
    })

    return {
      success: true,
      message: "Login successful",
      redirect: "/staff/dashboard",
    }
  } catch (error) {
    console.error("Staff login error:", error)
    return {
      success: false,
      message: "Unable to sign in. Please try again.",
    }
  }
}

export async function staffLogout() {
  try {
    await clearStaffSessionCookie()
    return {
      success: true,
      message: "Logout successful",
    }
  } catch (error) {
    console.error("Staff logout error:", error)
    return {
      success: false,
      message: "An error occurred during logout",
    }
  }
}
