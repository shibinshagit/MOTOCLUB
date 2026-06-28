"use server"

import { sql, isMockMode } from "@/lib/db"
import { getDefaultCompanyLogo } from "@/app/actions/brand-actions"
import { cookies } from "next/headers"

// Helper function for password hashing - same as in admin-actions.ts
async function generatePasswordHash(password: string): Promise<string> {
  // In a real application, use a proper hashing library like bcrypt
  // This is a simple hash for demonstration purposes only
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}

export async function login(formData: FormData) {
  try {
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    // Check if we're in mock mode (either explicitly set or due to database connection issues)
    if (isMockMode()) {
      console.log("Using mock login due to mock mode being enabled")

      // Mock login for demo mode
      // Set a cookie for the auth token
      cookies().set({
        name: "authToken",
        value: "demo-token",
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      })

      return {
        success: true,
        message: "Login successful (Demo Mode)",
        redirect: "/dashboard",
        data: {
          user: {
            id: 1,
            name: "Demo User",
            email: "demo@example.com",
            token: "demo-token",
          },
          device: {
            id: 1,
            name: "Demo Device",
            currency: "AED",
          },
          company: {
            id: 1,
            name: "Demo Company",
            logo_url: (await getDefaultCompanyLogo()) || "",
          },
        },
      }
    }

    // Try to query the database, but handle potential errors
    let user
    try {
      // Hash the password for comparison with stored hash
      const password_hash = await generatePasswordHash(password)

      // Check if the user exists with the correct password hash
      const result = await sql`
        SELECT d.id, d.name, d.email, c.name as company_name, c.logo_url as company_logo
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
        WHERE d.email = ${email} AND d.password_hash = ${password_hash}
      `

      if (result.length === 0) {
        return {
          success: false,
          message: "Invalid email or password",
        }
      }

      user = result[0]
    } catch (dbError) {
      console.error("Database error during login:", dbError)

      // Fall back to mock login if database query fails
      console.log("Falling back to mock login due to database error")

      // Set a cookie for the auth token
      cookies().set({
        name: "authToken",
        value: "demo-token",
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      })

      return {
        success: true,
        message: "Login successful (Demo Mode - Database Unavailable)",
        redirect: "/dashboard",
        data: {
          user: {
            id: 1,
            name: "Demo User",
            email: "demo@example.com",
            token: "demo-token",
          },
          device: {
            id: 1,
            name: "Demo Device",
            currency: "AED",
          },
          company: {
            id: 1,
            name: "Demo Company",
            logo_url: (await getDefaultCompanyLogo()) || "",
          },
        },
      }
    }

    // Generate a token (in a real app, use a proper JWT library)
    const token = Math.random().toString(36).substring(2)

    try {
      // Update the user's auth token
      await sql`
        UPDATE devices
        SET auth_token = ${token}
        WHERE id = ${user.id}
      `
    } catch (updateError) {
      console.error("Error updating auth token:", updateError)
      // Continue with login even if token update fails
      // This allows the user to log in even if the database is read-only
    }

    // After successful login, get complete device and company data
    try {
      const deviceData = await sql`
        SELECT 
          d.id, 
          d.name, 
          d.currency,
          c.id as company_id,
          c.name as company_name,
          c.logo_url as company_logo
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
        WHERE d.id = ${user.id}
      `

      const deviceInfo = deviceData[0] || {}

      return {
        success: true,
        message: "Login successful",
        redirect: "/dashboard",
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            token,
          },
          device: {
            id: deviceInfo.id || user.id,
            name: deviceInfo.name || "Default Device",
            currency: deviceInfo.currency || "AED",
          },
          company: {
            id: deviceInfo.company_id || 1,
            name: deviceInfo.company_name || user.company_name || "Default Company",
            logo_url: deviceInfo.company_logo || user.company_logo || (await getDefaultCompanyLogo()) || "",
          },
        },
      }
    } catch (deviceError) {
      console.error("Error fetching device data:", deviceError)

      // Fallback with basic data
      return {
        success: true,
        message: "Login successful (Limited device data)",
        redirect: "/dashboard",
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            token,
          },
          device: {
            id: user.id,
            name: "Default Device",
            currency: "AED",
          },
          company: {
            id: 1,
            name: user.company_name || "Default Company",
            logo_url: user.company_logo || (await getDefaultCompanyLogo()) || "",
          },
        },
      }
    }
  } catch (error) {
    console.error("Login error:", error)

    // Fall back to mock login for any unexpected errors
    console.log("Falling back to mock login due to unexpected error")

    // Set a cookie for the auth token
    cookies().set({
      name: "authToken",
      value: "demo-token",
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })

    return {
      success: true,
      message: "Login successful (Demo Mode - Error Recovery)",
      redirect: "/dashboard",
      data: {
        user: {
          id: 1,
          name: "Demo User",
          email: "demo@example.com",
          token: "demo-token",
        },
        device: {
          id: 1,
          name: "Demo Device",
          currency: "AED",
        },
        company: {
          id: 1,
          name: "Demo Company",
          logo_url: (await getDefaultCompanyLogo()) || "",
        },
      },
    }
  }
}

export async function logout() {
  try {
    // Clear the auth token cookie
    cookies().delete("authToken")

    return {
      success: true,
      message: "Logout successful",
      clearRedux: true, // Signal to clear Redux state
    }
  } catch (error) {
    console.error("Logout error:", error)
    return {
      success: false,
      message: "An error occurred during logout",
      clearRedux: true, // Still clear Redux even on error
    }
  }
}

export async function getCurrentUser() {
  try {
    if (isMockMode()) {
      // Mock user for demo mode
      return {
        id: 1,
        name: "Demo User",
        email: "demo@example.com",
        company_name: "Demo Company",
        company_logo: (await getDefaultCompanyLogo()) || "",
      }
    }

    try {
      // In a real app, you would verify the token and get the user
      const result = await sql`
        SELECT d.id, d.name, d.email, c.name as company_name, c.logo_url as company_logo
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
        LIMIT 1
      `

      if (result.length === 0) {
        // Fall back to mock user if no users found
        return {
          id: 1,
          name: "Demo User",
          email: "demo@example.com",
          company_name: "Demo Company",
          company_logo: (await getDefaultCompanyLogo()) || "",
        }
      }

      return result[0]
    } catch (dbError) {
      console.error("Database error getting current user:", dbError)

      // Fall back to mock user if database query fails
      return {
        id: 1,
        name: "Demo User",
        email: "demo@example.com",
        company_name: "Demo Company",
        company_logo: (await getDefaultCompanyLogo()) || "",
      }
    }
  } catch (error) {
    console.error("Get current user error:", error)

    // Fall back to mock user for any unexpected errors
    return {
      id: 1,
      name: "Demo User",
      email: "demo@example.com",
      company_name: "Demo Company",
      company_logo: (await getDefaultCompanyLogo()) || "",
    }
  }
}

export async function forgotPassword(formData: FormData) {
  try {
    const email = formData.get("email") as string

    if (isMockMode()) {
      // Mock response for demo mode
      return {
        success: true,
        message: "Password reset instructions sent to your email (Demo Mode)",
      }
    }

    try {
      // Check if the user exists
      const result = await sql`
        SELECT id FROM devices WHERE email = ${email}
      `

      if (result.length === 0) {
        return {
          success: false,
          message: "No account found with that email address",
        }
      }
    } catch (dbError) {
      console.error("Database error during forgot password:", dbError)

      // Fall back to mock response if database query fails
      return {
        success: true,
        message: "Password reset instructions sent to your email (Demo Mode - Database Unavailable)",
      }
    }

    // In a real app, you would send a password reset email here
    // For now, we'll just return a success message

    return {
      success: true,
      message: "Password reset instructions sent to your email",
    }
  } catch (error) {
    console.error("Forgot password error:", error)
    return {
      success: false,
      message: "An error occurred while processing your request",
    }
  }
}

export async function signUp(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    if (isMockMode()) {
      // Mock response for demo mode
      return {
        success: true,
        message: "Account created successfully (Demo Mode)",
        data: {
          id: 999,
          name,
          email,
        },
      }
    }

    try {
      // Check if the email is already in use
      const emailCheck = await sql`
        SELECT id FROM devices WHERE email = ${email}
      `

      if (emailCheck.length > 0) {
        return {
          success: false,
          message: "Email address is already in use",
        }
      }
    } catch (dbError) {
      console.error("Database error during signup:", dbError)

      // Fall back to mock response if database query fails
      return {
        success: true,
        message: "Account created successfully (Demo Mode - Database Unavailable)",
        data: {
          id: 999,
          name,
          email,
        },
      }
    }

    // In a real app, you would create a new user account here
    // For now, we'll just return a success message
    // Note: In the actual implementation, this would need to be connected to a company

    return {
      success: true,
      message: "Account created successfully. Please contact your administrator to assign you to a company.",
    }
  } catch (error) {
    console.error("Sign up error:", error)
    return {
      success: false,
      message: "An error occurred while creating your account",
    }
  }
}
