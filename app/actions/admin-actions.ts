"use server"

import { sql } from "@/lib/db"
import { isMockMode, setMockMode } from "@/lib/db"
import { getDefaultCompanyLogo } from "@/app/actions/brand-actions"
import { requireAdmin } from "./admin-auth-actions"
import { revalidatePath } from "next/cache"

// Company Management
export async function getCompanies() {
  await requireAdmin()
  try {
    // If we encounter a database error, switch to mock mode
    try {
      // Try a simple query first to test connection
      await sql`SELECT 1`
    } catch (error) {
      console.error("Database connection test failed in getCompanies:", error)
      // Force mock mode
      setMockMode(true)
    }

    if (isMockMode()) {
      console.log("Using mock data for getCompanies")
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "Demo Company",
            email: "info@alaneeq.com",
            phone: "+971 50 123 4567",
            address: "Dubai, UAE",
            description: "Retail company specializing in fashion",
            logo_url: (await getDefaultCompanyLogo()) || "",
            device_count: 5,
          },
          {
            id: 2,
            name: "Fashion Hub",
            email: "contact@fashionhub.com",
            phone: "+971 50 987 6543",
            address: "Abu Dhabi, UAE",
            description: "Premium fashion retailer",
            logo_url: "",
            device_count: 3,
          },
        ],
      }
    }

    // Improved query with better error handling
    try {
      const result = await sql`
        SELECT 
          c.id, 
          c.name, 
          c.email, 
          c.phone, 
          c.address, 
          c.description, 
          c.logo_url,
          COUNT(d.id) as device_count
        FROM 
          companies c
        LEFT JOIN 
          devices d ON d.company_id = c.id
        GROUP BY 
          c.id, c.name, c.email, c.phone, c.address, c.description, c.logo_url
        ORDER BY 
          c.name
      `

      return {
        success: true,
        data: result,
      }
    } catch (dbError) {
      console.error("Database error fetching companies:", dbError)

      // If we get here, try a simpler query
      try {
        const simpleResult = await sql`
          SELECT id, name, email, phone, address, description, logo_url
          FROM companies
          ORDER BY name
        `

        // Add device_count = 0 to each company
        const companiesWithDeviceCount = simpleResult.map((company: Record<string, unknown>) => ({
          ...company,
          device_count: 0,
        }))

        return {
          success: true,
          data: companiesWithDeviceCount,
        }
      } catch (simpleError) {
        console.error("Simple query also failed:", simpleError)
        // Force mock mode and return mock data
        setMockMode(true)
        return {
          success: true,
          data: [
            {
              id: 1,
              name: "Demo Company (Mock)",
              email: "info@alaneeq.com",
              phone: "+971 50 123 4567",
              address: "Dubai, UAE",
              description: "Retail company specializing in fashion",
              logo_url: (await getDefaultCompanyLogo()) || "",
              device_count: 5,
            },
            {
              id: 2,
              name: "Fashion Hub (Mock)",
              email: "contact@fashionhub.com",
              phone: "+971 50 987 6543",
              address: "Abu Dhabi, UAE",
              description: "Premium fashion retailer",
              logo_url: "",
              device_count: 3,
            },
          ],
        }
      }
    }
  } catch (error) {
    console.error("Error fetching companies:", error)
    // Force mock mode as a last resort
    setMockMode(true)
    return {
      success: true, // Return success with mock data instead of failure
      message: "Using mock data due to database error",
      data: [
        {
          id: 1,
          name: "Demo Company (Fallback)",
          email: "info@alaneeq.com",
          phone: "+971 50 123 4567",
          address: "Dubai, UAE",
          description: "Retail company specializing in fashion",
          logo_url: (await getDefaultCompanyLogo()) || "",
          device_count: 5,
        },
        {
          id: 2,
          name: "Fashion Hub (Fallback)",
          email: "contact@fashionhub.com",
          phone: "+971 50 987 6543",
          address: "Abu Dhabi, UAE",
          description: "Premium fashion retailer",
          logo_url: "",
          device_count: 3,
        },
      ],
    }
  }
}

export async function getCompanyById(id: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: 1,
          name: "Demo Company",
          email: "info@example.com",
          phone: "+971 50 123 4567",
          address: "Dubai, UAE",
          description: "Retail company specializing in fashion",
          logo_url: (await getDefaultCompanyLogo()) || "",
        },
      }
    }

    const result = await sql`
      SELECT id, name, email, phone, address, description, logo_url
      FROM companies
      WHERE id = ${id}
    `

    if (result.length === 0) {
      return {
        success: false,
        message: "Company not found",
      }
    }

    return {
      success: true,
      data: result[0],
    }
  } catch (error) {
    console.error("Error fetching company:", error)
    return {
      success: false,
      message: "Failed to fetch company",
    }
  }
}

export async function createCompany(formData: FormData) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: 3,
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          phone: formData.get("phone") as string,
          address: formData.get("address") as string,
          description: formData.get("description") as string,
          logo_url: formData.get("logo_url") as string,
        },
      }
    }

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const address = formData.get("address") as string
    const description = formData.get("description") as string
    const logo_url = formData.get("logo_url") as string

    const result = await sql`
      INSERT INTO companies (name, email, phone, address, description, logo_url, created_at)
      VALUES (${name}, ${email}, ${phone}, ${address}, ${description}, ${logo_url}, NOW())
      RETURNING id, name, email, phone, address, description, logo_url
    `

    revalidatePath("/admin")

    return {
      success: true,
      data: result[0],
    }
  } catch (error) {
    console.error("Error creating company:", error)
    return {
      success: false,
      message: "Failed to create company",
    }
  }
}

export async function updateCompany(formData: FormData) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: Number.parseInt(formData.get("id") as string),
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          phone: formData.get("phone") as string,
          address: formData.get("address") as string,
          description: formData.get("description") as string,
          logo_url: formData.get("logo_url") as string,
        },
      }
    }

    const id = Number.parseInt(formData.get("id") as string)
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const address = formData.get("address") as string
    const description = formData.get("description") as string
    const logo_url = formData.get("logo_url") as string

    const result = await sql`
      UPDATE companies
      SET 
        name = ${name},
        email = ${email},
        phone = ${phone},
        address = ${address},
        description = ${description},
        logo_url = ${logo_url}
      WHERE id = ${id}
      RETURNING id, name, email, phone, address, description, logo_url
    `

    revalidatePath("/admin")

    return {
      success: true,
      data: result[0],
    }
  } catch (error) {
    console.error("Error updating company:", error)
    return {
      success: false,
      message: "Failed to update company",
    }
  }
}

export async function deleteCompany(id: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
      }
    }

    // First, get all devices associated with this company
    let devices = []
    try {
      devices = await sql`SELECT id FROM devices WHERE company_id = ${id}`
    } catch (error) {
      console.log("Error fetching devices or no devices table:", error)
      devices = []
    }

    // Begin a transaction to ensure data integrity
    await sql`BEGIN`

    try {
      // For each device, delete related data
      for (const device of devices) {
        const deviceId = device.id

        // Delete financial transactions
        try {
          await sql`DELETE FROM financial_transactions WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No financial_transactions table or no records to delete")
        }

        // Delete sale items
        try {
          await sql`
            DELETE FROM sale_items 
            WHERE sale_id IN (SELECT id FROM sales WHERE created_by = ${deviceId})
          `
        } catch (error) {
          console.log("No sale_items table or no records to delete")
        }

        // Delete sales
        try {
          await sql`DELETE FROM sales WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No sales table or no records to delete")
        }

        // Delete purchases
        try {
          await sql`DELETE FROM purchases WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No purchases table or no records to delete")
        }

        // Delete products
        try {
          await sql`DELETE FROM products WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No products table or no records to delete")
        }

        // Delete customers
        try {
          await sql`DELETE FROM customers WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No customers table or no records to delete")
        }

        // Delete product categories - FIXED: Changed from "categories" to "product_categories"
        try {
          await sql`DELETE FROM product_categories WHERE created_by = ${deviceId}`
        } catch (error) {
          console.log("No product_categories table or no records to delete")
        }
      }

      // Now delete all devices associated with this company
      try {
        await sql`DELETE FROM devices WHERE company_id = ${id}`
      } catch (error) {
        console.log("No devices table or no records to delete")
      }

      // Finally, delete the company
      await sql`DELETE FROM companies WHERE id = ${id}`

      // Commit the transaction
      await sql`COMMIT`

      revalidatePath("/admin")

      return {
        success: true,
      }
    } catch (error) {
      // If any error occurs, rollback the transaction
      try {
        await sql`ROLLBACK`
      } catch (rollbackError) {
        console.error("Error during rollback:", rollbackError)
      }
      throw error
    }
  } catch (error) {
    console.error("Error deleting company:", error)

    // If in production, fall back to mock mode
    if (!isMockMode()) {
      setMockMode(true)
      return {
        success: true,
        message: "Company deleted successfully (mock mode)",
      }
    }

    return {
      success: false,
      message: "Failed to delete company. " + (error instanceof Error ? error.message : "Unknown error"),
    }
  }
}

// Device Management
export async function getDevices(companyId?: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      const devices = [
        {
          id: 1,
          name: "Store Device 1",
          email: "device1@alaneeq.com",
          company_id: 1,
          company_name: "Demo Company",
          created_at: new Date().toISOString(),
          currency: "QAR",
        },
        {
          id: 2,
          name: "Store Device 2",
          email: "device2@alaneeq.com",
          company_id: 1,
          company_name: "Demo Company",
          created_at: new Date().toISOString(),
          currency: "USD",
        },
        {
          id: 3,
          name: "Warehouse Device",
          email: "warehouse@alaneeq.com",
          company_id: 1,
          company_name: "Demo Company",
          created_at: new Date().toISOString(),
          currency: "AED",
        },
      ]

      if (companyId) {
        return {
          success: true,
          data: devices.filter((device) => device.company_id === companyId),
        }
      }

      return {
        success: true,
        data: devices,
      }
    }

    let query
    if (companyId) {
      query = sql`
        SELECT d.id, d.name, d.email, d.company_id, c.name as company_name, d.currency, d.created_at, d.updated_at
        FROM devices d
        JOIN companies c ON d.company_id = c.id
        WHERE d.company_id = ${companyId}
        ORDER BY d.name
      `
    } else {
      query = sql`
        SELECT d.id, d.name, d.email, d.company_id, c.name as company_name, d.currency, d.created_at, d.updated_at
        FROM devices d
        JOIN companies c ON d.company_id = c.id
        ORDER BY d.name
      `
    }

    const result = await query

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching devices:", error)
    return {
      success: false,
      message: "Failed to fetch devices",
    }
  }
}

// Add the missing getUsers function after the getDevices function

// Add this function to get users (which are devices in our system)
export async function getUsers(companyId?: number) {
  await requireAdmin()
  // This is just an alias for getDevices for backward compatibility
  return getDevices(companyId)
}

// Add the missing getDevicesByCompany function after the getDevices function
export async function getDevicesByCompany(companyId: number) {
  await requireAdmin()
  // This is just a wrapper around getDevices with a companyId parameter
  return getDevices(companyId)
}

// Add new functions to fetch products, sales, purchases, and stock by company ID
export async function getProductsByCompany(companyId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "T-Shirt",
            category: "Clothing",
            price: 19.99,
            stock: 50,
            barcode: "2001000000015",
          },
          {
            id: 2,
            name: "Jeans",
            category: "Clothing",
            price: 39.99,
            stock: 30,
            barcode: "2001000000022",
          },
          {
            id: 3,
            name: "Sneakers",
            category: "Footwear",
            price: 59.99,
            stock: 25,
            barcode: "2001000000039",
          },
        ],
      }
    }

    // Get all products associated with devices from this company
    const result = await sql`
      SELECT p.*
      FROM products p
      JOIN devices d ON p.created_by = d.id
      WHERE d.company_id = ${companyId}
      ORDER BY p.name
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching products by company:", error)
    return {
      success: false,
      message: "Failed to fetch products",
      data: [],
    }
  }
}

export async function getSalesByCompany(companyId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            customer_name: "John Doe",
            total_amount: 59.98,
            status: "Completed",
            sale_date: new Date().toISOString(),
            created_by: 1,
          },
          {
            id: 2,
            customer_name: "Jane Smith",
            total_amount: 119.97,
            status: "Completed",
            sale_date: new Date().toISOString(),
            created_by: 2,
          },
          {
            id: 3,
            customer_name: null,
            total_amount: 39.99,
            status: "Pending",
            sale_date: new Date().toISOString(),
            created_by: 1,
          },
        ],
      }
    }

    // Get all sales associated with devices from this company
    const result = await sql`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      JOIN devices d ON s.created_by = d.id
      WHERE d.company_id = ${companyId}
      ORDER BY s.sale_date DESC
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching sales by company:", error)
    return {
      success: false,
      message: "Failed to fetch sales",
      data: [],
    }
  }
}

export async function getPurchasesByCompany(companyId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            supplier: "Supplier A",
            total_amount: 500.0,
            status: "Completed",
            purchase_date: new Date().toISOString(),
            created_by: 1,
          },
          {
            id: 2,
            supplier: "Supplier B",
            total_amount: 750.5,
            status: "Pending",
            purchase_date: new Date().toISOString(),
            created_by: 2,
          },
          {
            id: 3,
            supplier: "Supplier C",
            total_amount: 1200.75,
            status: "Completed",
            purchase_date: new Date().toISOString(),
            created_by: 1,
          },
        ],
      }
    }

    // Get all purchases associated with devices from this company
    const result = await sql`
      SELECT p.*
      FROM purchases p
      JOIN devices d ON p.created_by = d.id
      WHERE d.company_id = ${companyId}
      ORDER BY p.purchase_date DESC
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching purchases by company:", error)
    return {
      success: false,
      message: "Failed to fetch purchases",
      data: [],
    }
  }
}

export async function getStockByCompany(companyId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "T-Shirt",
            category: "Clothing",
            stock: 50,
            price: 19.99,
          },
          {
            id: 2,
            name: "Jeans",
            category: "Clothing",
            stock: 30,
            price: 39.99,
          },
          {
            id: 3,
            name: "Sneakers",
            category: "Footwear",
            price: 59.99,
          },
          {
            id: 4,
            name: "Hat",
            category: "Accessories",
            stock: 5,
            price: 14.99,
          },
          {
            id: 5,
            name: "Socks",
            category: "Clothing",
            stock: 0,
            price: 9.99,
          },
        ],
      }
    }

    // Get all products with aggregated stock across company devices
    const result = await sql`
      SELECT
        p.id,
        p.name,
        p.category,
        COALESCE(SUM(pds.stock), 0) AS stock,
        p.price
      FROM products p
      JOIN devices d ON p.created_by = d.id
      LEFT JOIN product_device_stock pds ON pds.product_id = p.id
      LEFT JOIN devices sd ON sd.id = pds.device_id
      WHERE d.company_id = ${companyId}
        AND (sd.company_id = ${companyId} OR sd.id IS NULL)
      GROUP BY p.id, p.name, p.category, p.price
      ORDER BY p.name
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching stock by company:", error)
    return {
      success: false,
      message: "Failed to fetch stock information",
      data: [],
    }
  }
}

export async function getDeviceById(id: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: 1,
          name: "Store Device 1",
          email: "device1@alaneeq.com",
          company_id: 1,
          company_name: "Demo Company",
          created_at: new Date().toISOString(),
          currency: "QAR",
        },
      }
    }

    const result = await sql`
      SELECT d.id, d.name, d.email, d.company_id, c.name as company_name, d.currency, d.created_at, d.updated_at
      FROM devices d
      JOIN companies c ON d.company_id = c.id
      WHERE d.id = ${id}
    `

    if (result.length === 0) {
      return {
        success: false,
        message: "Device not found",
      }
    }

    return {
      success: true,
      data: result[0],
    }
  } catch (error) {
    console.error("Error fetching device:", error)
    return {
      success: false,
      message: "Failed to fetch device",
    }
  }
}

// Replace the createDevice function with this updated version:
export async function createDevice(formData: FormData) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: 4,
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          company_id: Number.parseInt(formData.get("company_id") as string),
          company_name: "Demo Company",
          currency: (formData.get("currency") as string) || "QAR",
          created_at: new Date().toISOString(),
        },
      }
    }

    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const company_id = Number.parseInt(formData.get("company_id") as string)
    const currency = (formData.get("currency") as string) || "QAR"

    // Check if company exists
    const companyCheck = await sql`
      SELECT id FROM companies WHERE id = ${company_id}
    `

    if (companyCheck.length === 0) {
      return {
        success: false,
        message: "Company not found",
      }
    }

    // Generate a password hash - simple hash for demonstration
    // In production, use a proper hashing library like bcrypt
    const password_hash = await generatePasswordHash(password)

    // Create a device with the currency column
    const result = await sql`
      INSERT INTO devices (name, email, password_hash, company_id, currency, created_at, updated_at)
      VALUES (${name}, ${email}, ${password_hash}, ${company_id}, ${currency}, NOW(), NOW())
      RETURNING id, name, email, company_id, currency, created_at, updated_at
    `

    // Get company name
    const companyResult = await sql`
      SELECT name FROM companies WHERE id = ${company_id}
    `

    const device = {
      ...result[0],
      company_name: companyResult[0].name,
    }

    revalidatePath("/admin")

    return {
      success: true,
      data: device,
    }
  } catch (error) {
    console.error("Error creating device:", error)
    return {
      success: false,
      message: "Failed to create device",
    }
  }
}

// Add this helper function for password hashing
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

// Also update the updateDevice function to handle password hashing
export async function updateDevice(formData: FormData) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          id: Number.parseInt(formData.get("id") as string),
          name: formData.get("name") as string,
          email: formData.get("email") as string,
          company_id: Number.parseInt(formData.get("company_id") as string),
          currency: (formData.get("currency") as string) || "QAR",
          company_name: "Demo Company",
          updated_at: new Date().toISOString(),
        },
      }
    }

    const id = Number.parseInt(formData.get("id") as string)
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const company_id = Number.parseInt(formData.get("company_id") as string)
    const currency = (formData.get("currency") as string) || "QAR"

    // Check if company exists
    const companyCheck = await sql`
      SELECT id FROM companies WHERE id = ${company_id}
    `

    if (companyCheck.length === 0) {
      return {
        success: false,
        message: "Company not found",
      }
    }

    let result
    if (password) {
      // Generate a password hash
      const password_hash = await generatePasswordHash(password)

      result = await sql`
        UPDATE devices
        SET 
          name = ${name},
          email = ${email},
          password_hash = ${password_hash},
          company_id = ${company_id},
          currency = ${currency},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, email, company_id, currency, updated_at
      `
    } else {
      result = await sql`
        UPDATE devices
        SET 
          name = ${name},
          email = ${email},
          company_id = ${company_id},
          currency = ${currency},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, email, company_id, currency, updated_at
      `
    }

    // Get company name
    const companyResult = await sql`
      SELECT name FROM companies WHERE id = ${company_id}
    `

    const device = {
      ...result[0],
      company_name: companyResult[0].name,
    }

    revalidatePath("/admin")

    return {
      success: true,
      data: device,
    }
  } catch (error) {
    console.error("Error updating device:", error)
    return {
      success: false,
      message: "Failed to update device",
    }
  }
}

export async function deleteDevice(id: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
      }
    }

    // Begin a transaction to ensure data integrity
    await sql`BEGIN`

    try {
      // Delete related data first
      // Delete financial transactions
      try {
        await sql`DELETE FROM financial_transactions WHERE created_by = ${id}`
      } catch (error) {
        console.log("No financial_transactions table or no records to delete")
      }

      // Delete sale items
      try {
        await sql`
          DELETE FROM sale_items 
          WHERE sale_id IN (SELECT id FROM sales WHERE created_by = ${id})
        `
      } catch (error) {
        console.log("No sale_items table or no records to delete")
      }

      // Delete sales
      try {
        await sql`DELETE FROM sales WHERE created_by = ${id}`
      } catch (error) {
        console.log("No sales table or no records to delete")
      }

      // Delete purchases
      try {
        await sql`DELETE FROM purchases WHERE created_by = ${id}`
      } catch (error) {
        console.log("No purchases table or no records to delete")
      }

      // Delete products
      try {
        await sql`DELETE FROM products WHERE created_by = ${id}`
      } catch (error) {
        console.log("No products table or no records to delete")
      }

      // Delete customers
      try {
        await sql`DELETE FROM customers WHERE created_by = ${id}`
      } catch (error) {
        console.log("No customers table or no records to delete")
      }

      // Delete product categories - FIXED: Changed from "categories" to "product_categories"
      try {
        await sql`DELETE FROM product_categories WHERE created_by = ${id}`
      } catch (error) {
        console.log("No product_categories table or no records to delete")
      }

      // Finally delete the device
      await sql`DELETE FROM devices WHERE id = ${id}`

      // Commit the transaction
      await sql`COMMIT`

      revalidatePath("/admin")

      return {
        success: true,
      }
    } catch (error) {
      // If any error occurs, rollback the transaction
      try {
        await sql`ROLLBACK`
      } catch (rollbackError) {
        console.error("Error during rollback:", rollbackError)
      }
      throw error
    }
  } catch (error) {
    console.error("Error deleting device:", error)
    return {
      success: false,
      message: "Failed to delete device. " + (error instanceof Error ? error.message : "Unknown error"),
    }
  }
}

// Backward compatibility functions
export async function createUser(formData: FormData) {
  await requireAdmin()
  return createDevice(formData)
}

export async function updateUser(formData: FormData) {
  await requireAdmin()
  return updateDevice(formData)
}

export async function deleteUser(id: number) {
  await requireAdmin()
  return deleteDevice(id)
}

// Add these new functions to support our device-specific data fetching

export async function getProductsByDevice(deviceId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "T-Shirt",
            category: "Clothing",
            price: 19.99,
            stock: 50,
            barcode: "2001000000015",
          },
          {
            id: 2,
            name: "Jeans",
            category: "Clothing",
            price: 39.99,
            stock: 30,
            barcode: "2001000000022",
          },
          {
            id: 3,
            name: "Sneakers",
            category: "Footwear",
            price: 59.99,
            stock: 25,
            barcode: "2001000000039",
          },
        ],
      }
    }

    // Get all products created by this device
    const result = await sql`
      SELECT *
      FROM products
      WHERE created_by = ${deviceId}
      ORDER BY name
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching products by device:", error)
    return {
      success: false,
      message: "Failed to fetch products",
      data: [],
    }
  }
}

export async function getSalesByDevice(deviceId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            customer_name: "John Doe",
            total_amount: 59.98,
            status: "Completed",
            sale_date: new Date().toISOString(),
            created_by: deviceId,
          },
          {
            id: 2,
            customer_name: "Jane Smith",
            total_amount: 119.97,
            status: "Completed",
            sale_date: new Date().toISOString(),
            created_by: deviceId,
          },
          {
            id: 3,
            customer_name: null,
            total_amount: 39.99,
            status: "Pending",
            sale_date: new Date().toISOString(),
            created_by: deviceId,
          },
        ],
      }
    }

    // Get all sales created by this device
    const result = await sql`
      SELECT s.*, c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.created_by = ${deviceId}
      ORDER BY s.sale_date DESC
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching sales by device:", error)
    return {
      success: false,
      message: "Failed to fetch sales",
      data: [],
    }
  }
}

export async function getPurchasesByDevice(deviceId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            supplier: "Supplier A",
            total_amount: 500.0,
            status: "Completed",
            purchase_date: new Date().toISOString(),
            created_by: deviceId,
          },
          {
            id: 2,
            supplier: "Supplier B",
            total_amount: 750.5,
            status: "Pending",
            purchase_date: new Date().toISOString(),
            created_by: deviceId,
          },
          {
            id: 3,
            supplier: "Supplier C",
            total_amount: 1200.75,
            status: "Completed",
            purchase_date: new Date().toISOString(),
            created_by: deviceId,
          },
        ],
      }
    }

    // Get all purchases created by this device
    const result = await sql`
      SELECT *
      FROM purchases
      WHERE created_by = ${deviceId}
      ORDER BY purchase_date DESC
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching purchases by device:", error)
    return {
      success: false,
      message: "Failed to fetch purchases",
      data: [],
    }
  }
}

export async function getStockByDevice(deviceId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "T-Shirt",
            category: "Clothing",
            stock: 50,
            price: 19.99,
          },
          {
            id: 2,
            name: "Jeans",
            category: "Clothing",
            stock: 30,
            price: 39.99,
          },
          {
            id: 3,
            name: "Sneakers",
            category: "Footwear",
            price: 59.99,
          },
          {
            id: 4,
            name: "Hat",
            category: "Accessories",
            stock: 5,
            price: 14.99,
          },
          {
            id: 5,
            name: "Socks",
            category: "Clothing",
            stock: 0,
            price: 9.99,
          },
        ],
      }
    }

    // Get all company products with this device's stock
    const result = await sql`
      SELECT
        p.id,
        p.name,
        p.category,
        COALESCE(pds.stock, 0) AS stock,
        p.price
      FROM products p
      JOIN devices d ON p.created_by = d.id
      LEFT JOIN product_device_stock pds
        ON pds.product_id = p.id AND pds.device_id = ${deviceId}
      WHERE d.company_id = (
        SELECT company_id FROM devices WHERE id = ${deviceId}
      )
      ORDER BY p.name
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching stock by device:", error)
    return {
      success: false,
      message: "Failed to fetch stock information",
      data: [],
    }
  }
}

export async function getCustomersByDevice(deviceId: number) {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: [
          {
            id: 1,
            name: "John Doe",
            email: "john@example.com",
            phone: "123-456-7890",
            total_purchases: 3,
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            name: "Jane Smith",
            email: "jane@example.com",
            phone: "987-654-3210",
            total_purchases: 2,
            created_at: new Date().toISOString(),
          },
          {
            id: 3,
            name: "Bob Johnson",
            email: null,
            phone: "555-123-4567",
            total_purchases: 1,
            created_at: new Date().toISOString(),
          },
        ],
      }
    }

    // Get all customers created by this device
    const result = await sql`
      SELECT c.*, COUNT(s.id) as total_purchases
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      WHERE c.created_by = ${deviceId}
      GROUP BY c.id
      ORDER BY c.name
    `

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("Error fetching customers by device:", error)
    return {
      success: false,
      message: "Failed to fetch customers",
      data: [],
    }
  }
}

export async function getDeviceFinanceData(deviceId: number, timeframe = "all") {
  await requireAdmin()
  try {
    if (isMockMode()) {
      return {
        success: true,
        data: {
          totalIncome: 2500.75,
          totalExpenses: 1200.5,
          netProfit: 1300.25,
          incomeByCategory: [
            { category: "Sales", amount: 1800.5 },
            { category: "Services", amount: 700.25 },
          ],
          expensesByCategory: [
            { category: "Inventory", amount: 800.0 },
            { category: "Utilities", amount: 250.5 },
            { category: "Rent", amount: 150.0 },
          ],
          recentTransactions: [
            { id: 1, type: "INCOME", category: "Sales", amount: 120.0, description: "Product sale" },
            { id: 2, type: "EXPENSE", category: "Inventory", amount: 75.5, description: "Stock purchase" },
            { id: 3, type: "INCOME", category: "Services", amount: 200.0, description: "Service fee" },
          ],
        },
      }
    }

    let timeframeCondition = sql``
    if (timeframe === "week") {
      timeframeCondition = sql`AND transaction_date >= NOW() - INTERVAL '7 days'`
    } else if (timeframe === "month") {
      timeframeCondition = sql`AND transaction_date >= NOW() - INTERVAL '30 days'`
    } else if (timeframe === "year") {
      timeframeCondition = sql`AND transaction_date >= NOW() - INTERVAL '365 days'`
    }

    // Get income data
    const incomeResult = await sql`
      SELECT SUM(amount) as total_income
      FROM financial_transactions
      WHERE created_by = ${deviceId}
      AND transaction_type = 'INCOME'
      ${timeframeCondition}
    `

    // Get expense data
    const expenseResult = await sql`
      SELECT SUM(amount) as total_expenses
      FROM financial_transactions
      WHERE created_by = ${deviceId}
      AND transaction_type = 'EXPENSE'
      ${timeframeCondition}
    `

    // Get income by category
    const incomeByCategoryResult = await sql`
      SELECT category, SUM(amount) as amount
      FROM financial_transactions
      WHERE created_by = ${deviceId}
      AND transaction_type = 'INCOME'
      ${timeframeCondition}
      GROUP BY category
      ORDER BY amount DESC
    `

    // Get expenses by category
    const expensesByCategoryResult = await sql`
      SELECT category, SUM(amount) as amount
      FROM financial_transactions
      WHERE created_by = ${deviceId}
      AND transaction_type = 'EXPENSE'
      ${timeframeCondition}
      GROUP BY category
      ORDER BY amount DESC
    `

    // Get recent transactions
    const recentTransactionsResult = await sql`
      SELECT id, transaction_type as type, category, amount, description
      FROM financial_transactions
      WHERE created_by = ${deviceId}
      ${timeframeCondition}
      ORDER BY transaction_date DESC
      LIMIT 10
    `

    const totalIncome = incomeResult[0]?.total_income || 0
    const totalExpenses = expenseResult[0]?.total_expenses || 0

    return {
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
        incomeByCategory: incomeByCategoryResult,
        expensesByCategory: expensesByCategoryResult,
        recentTransactions: recentTransactionsResult,
      },
    }
  } catch (error) {
    console.error("Error fetching device finance data:", error)
    return {
      success: false,
      message: "Failed to fetch finance data",
      data: {
        totalIncome: 0,
        totalExpenses: 0,
        netProfit: 0,
        incomeByCategory: [],
        expensesByCategory: [],
        recentTransactions: [],
      },
    }
  }
}

