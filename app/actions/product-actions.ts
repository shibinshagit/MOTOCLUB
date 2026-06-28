"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { put, del } from "@vercel/blob"
import {
  assertStaffPageAccess,
  assertStaffValueAccess,
  filterProductForStaff,
  filterProductsForStaff,
  resolveStaffSessionContext,
} from "@/lib/staff-restrictions-server"


// Generate a unique barcode for a product
async function generateProductBarcode(productId: number): Promise<string> {
  // Format: PREFIX + PRODUCT_ID + CHECK_DIGIT
  // Using EAN-13 format (12 digits + 1 check digit)
  const prefix = "200" // Company prefix (3 digits)
  const paddedId = productId.toString().padStart(9, "0") // Product ID (9 digits)

  // Combine prefix and ID (12 digits)
  const barcodeWithoutCheck = prefix + paddedId

  // Calculate check digit (for EAN-13)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(barcodeWithoutCheck[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  // Complete barcode
  return barcodeWithoutCheck + checkDigit
}

// Updated encodeNumberAsLetters function to use Alphabetic Digit Cipher (A=1 to J=0)
export async function encodeNumberAsLetters(num: number): Promise<string> {
  if (num === 0) return "J" // 0 is encoded as J

  const digits = num.toString().split("")
  let result = ""

  for (const digit of digits) {
    const d = Number.parseInt(digit)
    if (d === 0) {
      result += "J" // 0 is encoded as J
    } else {
      // 1-9 are encoded as A-I
      result += String.fromCharCode(64 + d)
    }
  }

  return result
}

// Upload image to Vercel Blob with explicit token handling
async function uploadProductImage(file: File, productName: string): Promise<string | null> {
  try {
    // Get the token from environment variables
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN environment variable is not set")
      throw new Error("Blob storage token not configured")
    }

    // Create a safe filename
    const timestamp = Date.now()
    const safeName = productName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const filename = `products/${timestamp}-${safeName}.${extension}`

    console.log("Uploading image:", { filename, fileSize: file.size, fileType: file.type })

    // Upload to Vercel Blob with explicit token
    const blob = await put(filename, file, {
      access: "public",
      token: token, // Explicitly pass the token
    })

    console.log("Image uploaded successfully:", blob.url)
    return blob.url
  } catch (error) {
    console.error("Error uploading image:", error)

    // Return more specific error information
    if (error instanceof Error) {
      if (error.message.includes("token")) {
        throw new Error("Image upload failed: Blob storage not properly configured")
      } else if (error.message.includes("network")) {
        throw new Error("Image upload failed: Network error")
      } else {
        throw new Error(`Image upload failed: ${error.message}`)
      }
    }

    return null
  }
}

async function uploadProductVideo(file: File, productName: string): Promise<string | null> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN

    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN environment variable is not set")
      throw new Error("Blob storage token not configured")
    }

    const timestamp = Date.now()
    const safeName = productName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)
    const extension = file.name.split(".").pop()?.toLowerCase() || "mp4"
    const filename = `products/videos/${timestamp}-${safeName}.${extension}`

    const blob = await put(filename, file, {
      access: "public",
      token: token,
    })

    return blob.url
  } catch (error) {
    console.error("Error uploading video:", error)
    if (error instanceof Error) {
      throw new Error(`Video upload failed: ${error.message}`)
    }
    return null
  }
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024
const MAX_TOTAL_MEDIA_PAYLOAD_BYTES = 95 * 1024 * 1024

async function deleteProductMediaUrls(urls: string[]) {
  const validUrls = urls.filter((url) => typeof url === "string" && url.trim().length > 0)
  if (!validUrls.length) return

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      console.error("BLOB_READ_WRITE_TOKEN environment variable is not set for media deletion")
      return
    }

    await del(validUrls, { token })
  } catch (error) {
    console.error("Error deleting media from blob storage:", error)
  }
}

export async function cleanupProductMediaUrls(urls: string[]) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { success: true, message: "No media URLs to clean up" }
  }

  try {
    await deleteProductMediaUrls(urls)
    return { success: true, message: "Media cleanup completed" }
  } catch (error) {
    console.error("Cleanup product media error:", error)
    return { success: false, message: "Failed to clean up media" }
  }
}

const PLATFORM_KEYS = ["amazon", "flipkart", "meesho", "own_ecom"] as const
type PlatformKey = (typeof PLATFORM_KEYS)[number]
type PlatformStatus = "not_listed" | "active" | "archived"

function normalizePlatformStatus(value: unknown): PlatformStatus {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "active") return "active"
  if (normalized === "archived") return "archived"
  return "not_listed"
}

function resolveDeviceStock(product: any, stockMap: Map<number, number>) {
  if (stockMap.has(product.id)) {
    return Number(stockMap.get(product.id) || 0)
  }

  return 0
}

async function upsertDeviceStock(productId: number, deviceId: number, stock: number) {
  await sql`
    INSERT INTO product_device_stock (product_id, device_id, stock, updated_at)
    VALUES (${productId}, ${deviceId}, ${Math.max(0, stock)}, NOW())
    ON CONFLICT (product_id, device_id)
    DO UPDATE SET stock = ${Math.max(0, stock)}, updated_at = NOW()
  `
}

// NEW: Updated getProducts function with limit and search functionality
// Add this improved version to your product-actions.ts file
// Replace the existing getProducts function

export async function getProducts(userId?: number, limit?: number, searchTerm?: string) {
  resetConnectionState()

  console.log("getProducts called with:", { userId, limit, searchTerm })

  try {
    let products

    // Check if searchTerm is a pure number (likely an ID lookup)
    const isIdSearch = searchTerm && /^\d+$/.test(searchTerm.trim())

    if (isIdSearch) {
      // EXACT ID MATCH - highest priority
      const productId = parseInt(searchTerm!.trim(), 10)
      
      console.log('Exact ID search for:', productId)
      
      if (userId) {
        products = await sql`
          SELECT 
            p.*,
            c.name as category_name
          FROM products p
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE p.id = ${productId}
          AND p.created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
        `
      } else {
        products = await sql`
          SELECT 
            p.*,
            c.name as category_name
          FROM products p
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE p.id = ${productId}
        `
      }
      
      // If exact match found, return immediately
      if (products.length > 0) {
        const mappedProducts = products.map((product) => ({
          ...product,
          category: product.category_name || product.category || "",
        }))
        
        console.log(`Found exact product match for ID ${productId}:`, mappedProducts[0])
        return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }
      }
    }

    if (searchTerm && searchTerm.trim() !== "") {
      // Normalize search term: lowercase + remove spaces
      const searchPattern = `%${searchTerm.toLowerCase().replace(/\s+/g, "")}%`

      if (limit) {
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by IN (
              SELECT d2.id
              FROM devices d1
              JOIN devices d2 ON d2.company_id = d1.company_id
              WHERE d1.id = ${userId}
            )
            AND (
              REPLACE(LOWER(p.name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.category), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.company_name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.shelf), ' ', '') LIKE ${searchPattern} OR
              REPLACE(COALESCE(p.barcode, ''), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.color, '')), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.suitable_for, '')), ' ', '') LIKE ${searchPattern}
            )
            ORDER BY 
              CASE WHEN p.id::text = ${searchTerm.trim()} THEN 0 ELSE 1 END,
              p.created_at DESC
            LIMIT ${limit}
          `
        } else {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE (
              REPLACE(LOWER(p.name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.category), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.company_name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.shelf), ' ', '') LIKE ${searchPattern} OR
              REPLACE(COALESCE(p.barcode, ''), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.color, '')), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.suitable_for, '')), ' ', '') LIKE ${searchPattern}
            )
            ORDER BY 
              CASE WHEN p.id::text = ${searchTerm.trim()} THEN 0 ELSE 1 END,
              p.created_at DESC
            LIMIT ${limit}
          `
        }
      } else {
        // Search without limit
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by IN (
              SELECT d2.id
              FROM devices d1
              JOIN devices d2 ON d2.company_id = d1.company_id
              WHERE d1.id = ${userId}
            )
            AND (
              REPLACE(LOWER(p.name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.category), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.company_name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.shelf), ' ', '') LIKE ${searchPattern} OR
              REPLACE(COALESCE(p.barcode, ''), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.color, '')), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.suitable_for, '')), ' ', '') LIKE ${searchPattern}
            )
            ORDER BY 
              CASE WHEN p.id::text = ${searchTerm.trim()} THEN 0 ELSE 1 END,
              p.created_at DESC
          `
        } else {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE (
              REPLACE(LOWER(p.name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.category), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.company_name), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(p.shelf), ' ', '') LIKE ${searchPattern} OR
              REPLACE(COALESCE(p.barcode, ''), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.color, '')), ' ', '') LIKE ${searchPattern} OR
              REPLACE(LOWER(COALESCE(p.suitable_for, '')), ' ', '') LIKE ${searchPattern}
            )
            ORDER BY 
              CASE WHEN p.id::text = ${searchTerm.trim()} THEN 0 ELSE 1 END,
              p.created_at DESC
          `
        }
      }
    } else {
      // Regular fetch with optional limit (unchanged)
      if (limit) {
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by IN (
              SELECT d2.id
              FROM devices d1
              JOIN devices d2 ON d2.company_id = d1.company_id
              WHERE d1.id = ${userId}
            )
            ORDER BY p.created_at DESC
            LIMIT ${limit}
          `
        } else {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
            LIMIT ${limit}
          `
        }
      } else {
        // Fetch all (unchanged)
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by IN (
              SELECT d2.id
              FROM devices d1
              JOIN devices d2 ON d2.company_id = d1.company_id
              WHERE d1.id = ${userId}
            )
            ORDER BY p.created_at DESC
          `
        } else {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
          `
        }
      }
    }

    let stockMap = new Map<number, number>()
    let companyTotalStockMap = new Map<number, number>()
    if (userId) {
      const deviceStocks = await sql`
        SELECT product_id, stock
        FROM product_device_stock
        WHERE device_id = ${userId}
      `
      stockMap = new Map(deviceStocks.map((row) => [Number(row.product_id), Number(row.stock)]))

      const companyDeviceStocks = await sql`
        SELECT pds.product_id, COALESCE(SUM(pds.stock), 0) AS total_stock
        FROM product_device_stock pds
        JOIN devices d ON d.id = pds.device_id
        WHERE d.company_id = (
          SELECT company_id FROM devices WHERE id = ${userId}
        )
        GROUP BY pds.product_id
      `
      companyTotalStockMap = new Map(
        companyDeviceStocks.map((row) => [Number(row.product_id), Number(row.total_stock)]),
      )
    }

    // Map results with device-specific stock
    const mappedProducts = products.map((product) => {
      const currentDeviceStock = userId ? resolveDeviceStock(product, stockMap) : 0
      const companyTotalStock = userId
        ? Number(companyTotalStockMap.get(product.id) ?? currentDeviceStock)
        : currentDeviceStock

      return {
        ...product,
        stock: currentDeviceStock,
        company_total_stock: companyTotalStock,
        other_devices_stock: Math.max(0, companyTotalStock - currentDeviceStock),
        category: product.category_name || product.category || "",
      }
    })

    console.log(`Found ${mappedProducts.length} products`)

    return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }
  } catch (error) {
    console.error("Get products error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}


export async function getProductById(id: number, userId?: number) {
  if (!id) {
    return { success: false, message: "Product ID is required", data: null }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await sql`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      WHERE p.id = ${id}
    `

    if (result.length === 0) {
      return { success: false, message: "Product not found", data: null }
    }

    let resolvedStock = 0
    if (userId) {
      const deviceStock = await sql`
        SELECT stock
        FROM product_device_stock
        WHERE product_id = ${result[0].id} AND device_id = ${userId}
        LIMIT 1
      `

      resolvedStock =
        deviceStock.length > 0
          ? Number(deviceStock[0].stock || 0)
          : 0
    }

    // Include category from either category_id or legacy category field
    const product = {
      ...result[0],
      stock: resolvedStock,
      category: result[0].category_name || result[0].category || "",
    }

    const staff = userId ? await resolveStaffSessionContext(userId) : null
    return { success: true, data: filterProductForStaff(product, staff) }
  } catch (error) {
    console.error("Get product error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}

// Define executeWithRetry function
async function executeWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    if (retries > 0) {
      console.log(`Retrying after error: ${error.message}. Retries left: ${retries}`)
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second
      return executeWithRetry(fn, retries - 1)
    }
    throw error // Re-throw the error if no retries left
  }
}

// Updated function to check for duplicate products within the same company
async function checkProductDuplicates(name: string, barcode: string | null, userId?: number, excludeId?: number) {
  try {
    // If user context is missing, fall back to global checks
    if (!userId) {
      const nameQuery = excludeId
        ? await sql`
            SELECT id FROM products
            WHERE LOWER(name) = LOWER(${name})
            AND id != ${excludeId}
            LIMIT 1
          `
        : await sql`
            SELECT id FROM products
            WHERE LOWER(name) = LOWER(${name})
            LIMIT 1
          `

      if (nameQuery.length > 0) {
        return {
          isDuplicate: true,
          field: "name",
          message: `A product with the name "${name}" already exists.`,
        }
      }

      if (barcode) {
        const barcodeQuery = excludeId
          ? await sql`
              SELECT id FROM products
              WHERE barcode = ${barcode}
              AND id != ${excludeId}
              LIMIT 1
            `
          : await sql`
              SELECT id FROM products
              WHERE barcode = ${barcode}
              LIMIT 1
            `

        if (barcodeQuery.length > 0) {
          return {
            isDuplicate: true,
            field: "barcode",
            message: `A product with the barcode "${barcode}" already exists.`,
          }
        }
      }

      return { isDuplicate: false }
    }

    // Check for duplicate name within company products
    let nameQuery
    if (excludeId) {
      nameQuery = await sql`
        SELECT id FROM products 
        WHERE LOWER(name) = LOWER(${name}) 
        AND created_by IN (
          SELECT d2.id
          FROM devices d1
          JOIN devices d2 ON d2.company_id = d1.company_id
          WHERE d1.id = ${userId}
        )
        AND id != ${excludeId} 
        LIMIT 1
      `
    } else {
      nameQuery = await sql`
        SELECT id FROM products 
        WHERE LOWER(name) = LOWER(${name}) 
        AND created_by IN (
          SELECT d2.id
          FROM devices d1
          JOIN devices d2 ON d2.company_id = d1.company_id
          WHERE d1.id = ${userId}
        )
        LIMIT 1
      `
    }

    if (nameQuery.length > 0) {
      return {
        isDuplicate: true,
        field: "name",
        message: `A product with the name "${name}" already exists in your company products.`,
      }
    }

    // Check for duplicate barcode within company products (only if barcode is provided)
    if (barcode) {
      let barcodeQuery
      if (excludeId) {
        barcodeQuery = await sql`
          SELECT id FROM products 
          WHERE barcode = ${barcode} 
          AND created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
          AND id != ${excludeId} 
          LIMIT 1
        `
      } else {
        barcodeQuery = await sql`
          SELECT id FROM products 
          WHERE barcode = ${barcode} 
          AND created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
          LIMIT 1
        `
      }

      if (barcodeQuery.length > 0) {
        return {
          isDuplicate: true,
          field: "barcode",
          message: `A product with the barcode "${barcode}" already exists in your company products.`,
        }
      }
    }

    return { isDuplicate: false }
  } catch (error) {
    console.error("Error checking for duplicates:", error)
    return { isDuplicate: false } // Default to allowing the operation if check fails
  }
}

// Update the createProduct function to accept a barcode parameter

interface CreateProductParams {
  name: string
  company_name?: string
  category_id: number | null
  price: number
  wholesale_price?: number
  stock?: number
  barcode?: string // Add this line
  user_id?: number
}


// Update the createProduct function to check for duplicates within user's products
export async function createProduct(formData: FormData) {
  const name = formData.get("name") as string
  const companyName = formData.get("company_name") as string
  const category = formData.get("category") as string
  const categoryId = formData.get("category_id") ? Number(formData.get("category_id")) : null
  const description = (formData.get("description") as string) || ""
  const price = Number.parseFloat(formData.get("price") as string)
  const wholesalePrice = Number.parseFloat(formData.get("wholesale_price") as string) || 0
  const msp = Number.parseFloat(formData.get("msp") as string) || 0
  const stock = Number.parseInt(formData.get("stock") as string) || 0
  const shelf = formData.get("shelf") as string
  const userId = formData.get("user_id") ? Number.parseInt(formData.get("user_id") as string) : undefined
  const barcode = formData.get("barcode") as string
  const imageFile = formData.get("image") as File | null
  const imageFiles = formData.getAll("images").filter((item): item is File => item instanceof File && item.size > 0)
  const videoFile = formData.get("video") as File | null
  const uploadedImageUrlsRaw = (formData.get("uploaded_image_urls") as string) || ""
  const uploadedVideoUrlRaw = (formData.get("uploaded_video_url") as string) || ""
  const color = (formData.get("color") as string) || ""
  const size = (formData.get("size") as string) || ""
  const suitableFor = (formData.get("suitable_for") as string) || ""
  const attributesRaw = formData.get("attributes") as string
  const attributes = attributesRaw ? JSON.parse(attributesRaw) : []
  const link = (formData.get("link") as string) || ""
  const amazonStatus = normalizePlatformStatus(formData.get("amazon_status"))
  const flipkartStatus = normalizePlatformStatus(formData.get("flipkart_status"))
  const meeshoStatus = normalizePlatformStatus(formData.get("meesho_status"))
  const ownEcomStatus = normalizePlatformStatus(formData.get("own_ecom_status"))

  if (!name || isNaN(price)) {
    return { success: false, error: "Name and valid price are required" }
  }

  const normalizedImages =
    imageFiles.length > 0 ? imageFiles.slice(0, 4) : imageFile && imageFile.size > 0 ? [imageFile] : []
  for (const image of normalizedImages) {
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, error: `Image "${image.name}" exceeds 10MB limit` }
    }
  }
  if (videoFile && videoFile.size > MAX_VIDEO_SIZE_BYTES) {
    return { success: false, error: "Video exceeds 50MB limit" }
  }
  const totalMediaSize =
    normalizedImages.reduce((total, image) => total + image.size, 0) + (videoFile?.size || 0)
  if (totalMediaSize > MAX_TOTAL_MEDIA_PAYLOAD_BYTES) {
    return { success: false, error: "Total media payload exceeds 95MB limit" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check for duplicates within user's products before proceeding
    const duplicateCheck = await checkProductDuplicates(name, barcode, userId)
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        error: duplicateCheck.message,
        field: duplicateCheck.field,
      }
    }

    let uploadedImageUrls: string[] = []
    if (uploadedImageUrlsRaw) {
      try {
        const parsed = JSON.parse(uploadedImageUrlsRaw)
        if (Array.isArray(parsed)) {
          uploadedImageUrls = parsed
            .filter((url) => typeof url === "string" && url.trim().length > 0)
            .slice(0, 4)
        }
      } catch {
        uploadedImageUrls = []
      }
    }

    // Fallback: upload from server if client URLs are not provided.
    if (uploadedImageUrls.length === 0 && normalizedImages.length > 0) {
      try {
        for (const image of normalizedImages) {
          const uploaded = await uploadProductImage(image, name)
          if (uploaded) uploadedImageUrls.push(uploaded)
        }
      } catch (error) {
        console.error("Image upload error:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to upload product image(s)",
        }
      }
    }

    let videoUrl: string | null = uploadedVideoUrlRaw && uploadedVideoUrlRaw.trim() ? uploadedVideoUrlRaw.trim() : null
    if (!videoUrl && videoFile && videoFile.size > 0) {
      try {
        videoUrl = await uploadProductVideo(videoFile, name)
      } catch (error) {
        console.error("Video upload error:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to upload product video",
        }
      }
    }

    // Use executeWithRetry for database operations
    return await executeWithRetry(async () => {
      try {
        // First, insert the product with all new fields
        const result = await sql`
          INSERT INTO products (
            name, 
            company_name,
            category,
            category_id, 
            description, 
            price,
            wholesale_price,
            msp,
            shelf,
            image_url,
            image_urls,
            video_url,
            created_by,
            barcode,
            color,
            size,
            suitable_for,
            attributes,
            link,
            amazon_status,
            flipkart_status,
            meesho_status,
            own_ecom_status
          )
          VALUES (
            ${name}, 
            ${companyName || ""},
            ${category || ""}, 
            ${categoryId}, 
            ${description}, 
            ${price},
            ${wholesalePrice},
            ${msp},
            ${shelf || ""},
            ${uploadedImageUrls[0] || null},
            ${JSON.stringify(uploadedImageUrls)},
            ${videoUrl},
            ${userId},
            ${barcode},
            ${color},
            ${size},
            ${suitableFor},
            ${JSON.stringify(attributes)},
            ${link},
            ${amazonStatus},
            ${flipkartStatus},
            ${meeshoStatus},
            ${ownEcomStatus}
          )
          RETURNING *
        `

        if (result.length === 0) {
          return { success: false, error: "Failed to add product" }
        }

        const productId = result[0].id

        // Generate and update the barcode in a separate query if not provided
        const generatedBarcode = barcode || (await generateProductBarcode(productId))

        await sql`
          UPDATE products
          SET barcode = ${generatedBarcode}
          WHERE id = ${productId}
        `

        if (userId) {
          await upsertDeviceStock(productId, userId, stock)
        }

        // Always add a stock history record for initial stock (even if 0)
        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, quantity, type, reference_type, notes, created_by, device_id
            ) VALUES (
              ${productId}, ${stock}, 'adjustment', 'manual', 'Initial stock', ${userId}, ${userId}
            )
          `
        } catch (error) {
          console.error("Failed to add stock history, table might not exist:", error)
          // Continue execution even if this fails
        }

        // Get the updated product with barcode and category name
        const updatedProduct = await sql`
          SELECT 
            p.*,
            c.name as category_name
          FROM products p
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE p.id = ${productId}
        `

        const productWithDetails = updatedProduct.length > 0 ? updatedProduct[0] : result[0]
        productWithDetails.category = productWithDetails.category_name || category

        return {
          success: true,
          message: "Product added successfully",
          data: productWithDetails,
        }
      } catch (error) {
        console.error("Add product error:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)

        return {
          success: false,
          error: `Database error: ${errorMessage}. Please try again later.`,
        }
      }
    })
  } catch (error) {
    console.error("Add product error with retries:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: `Database error after multiple attempts: ${errorMessage}. The database might be temporarily unavailable. Please try again later.`,
    }
  }
}

// Update the updateProduct function to handle FormData properly
export async function updateProduct(formData: FormData) {
  const id = Number.parseInt(formData.get("id") as string)
  const name = formData.get("name") as string
  const companyName = formData.get("company_name") as string
  const category = formData.get("category") as string
  const categoryId = formData.get("category_id") ? Number(formData.get("category_id")) : null
  const description = (formData.get("description") as string) || ""
  const price = Number.parseFloat(formData.get("price") as string)
  const wholesalePrice = Number.parseFloat(formData.get("wholesale_price") as string) || 0
  const msp = Number.parseFloat(formData.get("msp") as string) || 0
  const stock = Number.parseInt(formData.get("stock") as string) || 0
  const shelf = formData.get("shelf") as string
  const barcode = formData.get("barcode") as string
  const imageFile = formData.get("image") as File | null
  const imageFiles = formData.getAll("images").filter((item): item is File => item instanceof File && item.size > 0)
  const videoFile = formData.get("video") as File | null
  const uploadedImageUrlsRaw = (formData.get("uploaded_image_urls") as string) || ""
  const uploadedVideoUrlRaw = (formData.get("uploaded_video_url") as string) || ""
  const removeVideo = String(formData.get("remove_video") || "false") === "true"
  const existingImageUrlsRaw = (formData.get("existing_image_urls") as string) || ""
  const hasExistingImageUrlsInput = formData.has("existing_image_urls")
  const userId = formData.get("user_id") ? Number.parseInt(formData.get("user_id") as string) : undefined
  const color = (formData.get("color") as string) || ""
  const size = (formData.get("size") as string) || ""
  const suitableFor = (formData.get("suitable_for") as string) || ""
  const attributesRaw = formData.get("attributes") as string
  const attributes = attributesRaw ? JSON.parse(attributesRaw) : []
  const link = (formData.get("link") as string) || ""
  const amazonStatusRaw = formData.get("amazon_status")
  const flipkartStatusRaw = formData.get("flipkart_status")
  const meeshoStatusRaw = formData.get("meesho_status")
  const ownEcomStatusRaw = formData.get("own_ecom_status")

  if (!id || !name || isNaN(price)) {
    return { success: false, message: "ID, name, and valid price are required" }
  }

  const normalizedNewImages =
    imageFiles.length > 0 ? imageFiles.slice(0, 4) : imageFile && imageFile.size > 0 ? [imageFile] : []
  for (const image of normalizedNewImages) {
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return { success: false, message: `Image "${image.name}" exceeds 10MB limit` }
    }
  }
  if (videoFile && videoFile.size > MAX_VIDEO_SIZE_BYTES) {
    return { success: false, message: "Video exceeds 50MB limit" }
  }
  const totalMediaSize =
    normalizedNewImages.reduce((total, image) => total + image.size, 0) + (videoFile?.size || 0)
  if (totalMediaSize > MAX_TOTAL_MEDIA_PAYLOAD_BYTES) {
    return { success: false, message: "Total media payload exceeds 95MB limit" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Get current product to get the userId if not provided
    const currentProduct = await sql`SELECT * FROM products WHERE id = ${id}`

    if (currentProduct.length === 0) {
      return { success: false, message: "Product not found" }
    }

    const productUserId = userId || currentProduct[0].created_by
    const currentVideoUrl = currentProduct[0].video_url || null
    let currentImageUrls: string[] = []
    if (Array.isArray(currentProduct[0].image_urls)) {
      currentImageUrls = currentProduct[0].image_urls.filter(
        (url: unknown) => typeof url === "string" && url.trim().length > 0,
      ) as string[]
    } else if (typeof currentProduct[0].image_urls === "string" && currentProduct[0].image_urls.trim()) {
      try {
        const parsed = JSON.parse(currentProduct[0].image_urls)
        if (Array.isArray(parsed)) {
          currentImageUrls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
        }
      } catch {
        currentImageUrls = []
      }
    }
    if (currentImageUrls.length === 0 && currentProduct[0].image_url) {
      currentImageUrls = [currentProduct[0].image_url]
    }

    // Check for duplicates within user's products before proceeding
    const duplicateCheck = await checkProductDuplicates(name, barcode, productUserId, id)
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        message: duplicateCheck.message,
        field: duplicateCheck.field,
      }
    }

    const amazonStatus = formData.has("amazon_status")
      ? normalizePlatformStatus(amazonStatusRaw)
      : normalizePlatformStatus(currentProduct[0].amazon_status)
    const flipkartStatus = formData.has("flipkart_status")
      ? normalizePlatformStatus(flipkartStatusRaw)
      : normalizePlatformStatus(currentProduct[0].flipkart_status)
    const meeshoStatus = formData.has("meesho_status")
      ? normalizePlatformStatus(meeshoStatusRaw)
      : normalizePlatformStatus(currentProduct[0].meesho_status)
    const ownEcomStatus = formData.has("own_ecom_status")
      ? normalizePlatformStatus(ownEcomStatusRaw)
      : normalizePlatformStatus(currentProduct[0].own_ecom_status)

    let parsedExistingImageUrls: string[] = []
    try {
      if (existingImageUrlsRaw) {
        const parsed = JSON.parse(existingImageUrlsRaw)
        if (Array.isArray(parsed)) {
          parsedExistingImageUrls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
        }
      }
    } catch {
      parsedExistingImageUrls = []
    }

    if (!hasExistingImageUrlsInput && parsedExistingImageUrls.length === 0) {
      if (Array.isArray(currentProduct[0].image_urls)) {
        parsedExistingImageUrls = currentProduct[0].image_urls.filter((url: unknown) => typeof url === "string") as string[]
      } else if (typeof currentProduct[0].image_urls === "string" && currentProduct[0].image_urls.trim()) {
        try {
          const parsed = JSON.parse(currentProduct[0].image_urls)
          if (Array.isArray(parsed)) {
            parsedExistingImageUrls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
          }
        } catch {
          parsedExistingImageUrls = []
        }
      }
      if (parsedExistingImageUrls.length === 0 && currentProduct[0].image_url) {
        parsedExistingImageUrls = [currentProduct[0].image_url]
      }
    }

    let uploadedImageUrls: string[] = []
    if (uploadedImageUrlsRaw) {
      try {
        const parsed = JSON.parse(uploadedImageUrlsRaw)
        if (Array.isArray(parsed)) {
          uploadedImageUrls = parsed
            .filter((url) => typeof url === "string" && url.trim().length > 0)
            .slice(0, 4)
        }
      } catch {
        uploadedImageUrls = []
      }
    }

    // Fallback: upload from server if client URLs are not provided.
    if (uploadedImageUrls.length === 0 && normalizedNewImages.length > 0) {
      try {
        for (const img of normalizedNewImages) {
          const uploaded = await uploadProductImage(img, name)
          if (uploaded) uploadedImageUrls.push(uploaded)
        }
      } catch (error) {
        console.error("Image upload error during update:", error)
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to upload product image(s)",
        }
      }
    }

    const finalImageUrls = [...parsedExistingImageUrls, ...uploadedImageUrls].slice(0, 4)
    let imageUrl = finalImageUrls[0] || null

    let videoUrl: string | null = currentProduct[0].video_url || null
    if (removeVideo) {
      videoUrl = null
    }
    if (uploadedVideoUrlRaw && uploadedVideoUrlRaw.trim()) {
      videoUrl = uploadedVideoUrlRaw.trim()
    } else if (videoFile && videoFile.size > 0) {
      try {
        const uploadedVideo = await uploadProductVideo(videoFile, name)
        if (uploadedVideo) {
          videoUrl = uploadedVideo
        }
      } catch (error) {
        console.error("Video upload error during update:", error)
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to upload product video",
        }
      }
    }

    // Start a transaction
    await sql`BEGIN`

    const stockDeviceId = userId || currentProduct[0].created_by
    const existingDeviceStock = await sql`
      SELECT stock
      FROM product_device_stock
      WHERE product_id = ${id} AND device_id = ${stockDeviceId}
      LIMIT 1
    `

    const oldStock = existingDeviceStock.length > 0 ? Number(existingDeviceStock[0].stock || 0) : 0

    // Update the product with all new fields
    let result

    if (userId) {
      result = await sql`
        UPDATE products
        SET 
          name = ${name}, 
          company_name = ${companyName || ""},
          category = ${category || ""},
          category_id = ${categoryId},
          description = ${description}, 
          price = ${price},
          wholesale_price = ${wholesalePrice},
          msp = ${msp},
          shelf = ${shelf || ""},
          image_url = ${imageUrl},
          image_urls = ${JSON.stringify(finalImageUrls)},
          video_url = ${videoUrl},
          barcode = ${barcode || currentProduct[0].barcode},
          color = ${color},
          size = ${size},
          suitable_for = ${suitableFor},
          attributes = ${JSON.stringify(attributes)},
          link = ${link},
          amazon_status = ${amazonStatus},
          flipkart_status = ${flipkartStatus},
          meesho_status = ${meeshoStatus},
          own_ecom_status = ${ownEcomStatus}
        WHERE id = ${id}
        AND created_by IN (
          SELECT d2.id
          FROM devices d1
          JOIN devices d2 ON d2.company_id = d1.company_id
          WHERE d1.id = ${userId}
        )
        RETURNING *
      `
    } else {
      result = await sql`
        UPDATE products
        SET 
          name = ${name}, 
          company_name = ${companyName || ""},
          category = ${category || ""},
          category_id = ${categoryId},
          description = ${description}, 
          price = ${price},
          wholesale_price = ${wholesalePrice},
          msp = ${msp},
          shelf = ${shelf || ""},
          image_url = ${imageUrl},
          image_urls = ${JSON.stringify(finalImageUrls)},
          video_url = ${videoUrl},
          barcode = ${barcode || currentProduct[0].barcode},
          color = ${color},
          size = ${size},
          suitable_for = ${suitableFor},
          attributes = ${JSON.stringify(attributes)},
          link = ${link},
          amazon_status = ${amazonStatus},
          flipkart_status = ${flipkartStatus},
          meesho_status = ${meeshoStatus},
          own_ecom_status = ${ownEcomStatus}
        WHERE id = ${id}
        RETURNING *
      `
    }

    if (result.length > 0) {
      await upsertDeviceStock(id, stockDeviceId, stock)

      // If stock has changed, add a stock history record
      if (stock !== oldStock) {
        const adjustmentQuantity = stock - oldStock
        const adjustmentType = adjustmentQuantity > 0 ? "adjustment" : "adjustment"

        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, quantity, type, reference_type, notes, created_by, device_id
            ) VALUES (
              ${id}, ${Math.abs(adjustmentQuantity)}, ${adjustmentType}, 'manual', 'Stock adjustment from product edit', ${userId || currentProduct[0].created_by}, ${stockDeviceId}
            )
          `
        } catch (error) {
          console.error("Failed to add stock history, table might not exist:", error)
          // Continue execution even if this fails
        }
      }

      // Get the category name
      let categoryName = category
      if (categoryId) {
        const categoryResult = await sql`SELECT name FROM product_categories WHERE id = ${categoryId}`
        if (categoryResult.length > 0) {
          categoryName = categoryResult[0].name
        }
      }

      // Commit the transaction
      await sql`COMMIT`

      const updatedProduct = result[0]
      updatedProduct.stock = stock
      updatedProduct.category = categoryName

      const removedImageUrls = currentImageUrls.filter((oldUrl) => !finalImageUrls.includes(oldUrl))
      const removedMediaUrls = [...removedImageUrls]
      if (currentVideoUrl && currentVideoUrl !== videoUrl) {
        removedMediaUrls.push(currentVideoUrl)
      }
      if (removedMediaUrls.length > 0) {
        await deleteProductMediaUrls(removedMediaUrls)
      }

      return { success: true, message: "Product updated successfully", data: updatedProduct }
    }

    await sql`ROLLBACK`
    return { success: false, message: "Failed to update product" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Update product error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// Update the deleteProduct function to check for active sales
export async function deleteProduct(id: number) {
  if (!id) {
    return { success: false, message: "Product ID is required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check if product is used in any sales or purchases
    const saleItems =
      await sql`SELECT si.id, s.status FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE si.product_id = ${id}`
    const purchaseItems = await sql`SELECT id FROM purchase_items WHERE product_id = ${id}`

    // Check specifically for active sales (not cancelled)
    const activeSales = saleItems.filter((item) => item.status !== "cancelled")

    if (activeSales.length > 0) {
      return {
        success: false,
        message: "Cannot delete product that has active sales. Please cancel the sales first.",
      }
    }

    let stockHistory = []
    try {
      stockHistory = await sql`SELECT id FROM product_stock_history WHERE product_id = ${id}`
    } catch (error) {
      console.error("Stock history table might not exist:", error)
      // Continue execution even if this fails
    }

    // Start a transaction
    await sql`BEGIN`

    // Delete stock history first (if any)
    if (stockHistory.length > 0) {
      try {
        await sql`DELETE FROM product_stock_history WHERE product_id = ${id}`
      } catch (error) {
        console.error("Failed to delete stock history:", error)
        // Continue execution even if this fails
      }
    }

    // Delete the product
    const result = await sql`DELETE FROM products WHERE id = ${id} RETURNING id`

    if (result.length > 0) {
      // Commit the transaction
      await sql`COMMIT`

      return { success: true, message: "Product deleted successfully" }
    }

    await sql`ROLLBACK`
    return { success: false, message: "Failed to delete product" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Delete product error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function updateProductPlatformStatus(
  productId: number,
  platform: PlatformKey,
  status: PlatformStatus,
  userId?: number,
) {
  if (!productId) {
    return { success: false, message: "Product ID is required" }
  }

  if (!PLATFORM_KEYS.includes(platform)) {
    return { success: false, message: "Invalid platform" }
  }

  const normalizedStatus = normalizePlatformStatus(status)

  resetConnectionState()

  try {
    const columnName =
      platform === "amazon"
        ? "amazon_status"
        : platform === "flipkart"
          ? "flipkart_status"
          : platform === "meesho"
            ? "meesho_status"
            : "own_ecom_status"

    let result
    if (userId) {
      result =
        await sql`
          SELECT *
          FROM products
          WHERE id = ${productId}
          AND created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
        `
    } else {
      result = await sql`SELECT * FROM products WHERE id = ${productId}`
    }

    if (!result.length) {
      return { success: false, message: "Product not found" }
    }

    if (columnName === "amazon_status") {
      result = await sql`UPDATE products SET amazon_status = ${normalizedStatus}, updated_at = NOW() WHERE id = ${productId} RETURNING *`
    } else if (columnName === "flipkart_status") {
      result = await sql`UPDATE products SET flipkart_status = ${normalizedStatus}, updated_at = NOW() WHERE id = ${productId} RETURNING *`
    } else if (columnName === "meesho_status") {
      result = await sql`UPDATE products SET meesho_status = ${normalizedStatus}, updated_at = NOW() WHERE id = ${productId} RETURNING *`
    } else {
      result = await sql`UPDATE products SET own_ecom_status = ${normalizedStatus}, updated_at = NOW() WHERE id = ${productId} RETURNING *`
    }

    if (!result.length) {
      return { success: false, message: "Failed to update platform status" }
    }

    return { success: true, data: result[0], message: "Platform status updated" }
  } catch (error) {
    console.error("Update platform status error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// Add getProductStockHistory function
export async function getProductStockHistory(productId: number, limit?: number) {
  if (!productId) {
    return { success: false, message: "Product ID is required", data: [], hasMore: false }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Get stock history from the dedicated table
    try {
      const safeLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined
      if (safeLimit) {
        const historyWithExtra = await sql`
          SELECT 
            h.id, 
            h.product_id, 
            h.quantity, 
            h.type, 
            h.reference_id, 
            h.reference_type, 
            h.notes, 
            h.device_id,
            COALESCE(d.name, 'Unknown Device') AS device_name,
            h.created_at as date
          FROM product_stock_history h
          LEFT JOIN devices d ON d.id = h.device_id
          WHERE h.product_id = ${productId}
          ORDER BY h.created_at DESC
          LIMIT ${safeLimit + 1}
        `
        const hasMore = historyWithExtra.length > safeLimit
        return { success: true, data: historyWithExtra.slice(0, safeLimit), hasMore }
      }

      const history =
        await sql`
          SELECT 
            h.id, 
            h.product_id, 
            h.quantity, 
            h.type, 
            h.reference_id, 
            h.reference_type, 
            h.notes, 
            h.device_id,
            COALESCE(d.name, 'Unknown Device') AS device_name,
            h.created_at as date
          FROM product_stock_history h
          LEFT JOIN devices d ON d.id = h.device_id
          WHERE h.product_id = ${productId}
          ORDER BY h.created_at DESC
        `
      return { success: true, data: history, hasMore: false }
    } catch (error) {
      console.error("Stock history table might not exist:", error)
      return { success: true, data: [], hasMore: false }
    }
  } catch (error) {
    console.error("Get product stock history error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
      hasMore: false,
    }
  }
}

export async function getProductStockByDevice(productId: number, userId: number) {
  if (!productId || !userId) {
    return { success: false, message: "Product ID and User ID are required", data: [] }
  }

  resetConnectionState()

  try {
    const devices = await sql`
      SELECT d.id AS device_id, d.name AS device_name, COALESCE(pds.stock, 0) AS stock
      FROM devices d
      LEFT JOIN product_device_stock pds
        ON pds.device_id = d.id AND pds.product_id = ${productId}
      WHERE d.company_id = (
        SELECT company_id FROM devices WHERE id = ${userId}
      )
      ORDER BY d.name ASC
    `

    const data = devices.map((row) => ({
      device_id: Number(row.device_id),
      device_name: row.device_name,
      stock: Number(row.stock || 0),
      is_current_device: Number(row.device_id) === Number(userId),
    }))

    return { success: true, data }
  } catch (error) {
    console.error("Get product stock by device error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function adjustProductStock(formData: FormData) {

  const productId = Number.parseInt(formData.get("product_id") as string)
  const quantity = Number.parseInt(formData.get("quantity") as string)
  const type = formData.get("type") as string // 'increase' or 'decrease'
  const notes = formData.get("notes") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  if (!productId || isNaN(quantity) || quantity <= 0 || !type) {
    return { success: false, message: "Product ID, valid quantity, and adjustment type are required" }
  }

  const pageAccess = await assertStaffPageAccess(userId, "product")
  if (!pageAccess.allowed) {
    return { success: false, message: pageAccess.message }
  }

  const valueAccess = await assertStaffValueAccess(userId, "stock_count")
  if (!valueAccess.allowed) {
    return { success: false, message: valueAccess.message }
  }

  if (type !== "increase" && type !== "decrease") {
    return { success: false, message: "Type must be 'increase' or 'decrease'" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Start a transaction
    await sql`BEGIN`

    // Get current product
    const product = await sql`SELECT * FROM products WHERE id = ${productId}`

    if (product.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Product not found" }
    }

    const existingDeviceStock = await sql`
      SELECT stock
      FROM product_device_stock
      WHERE product_id = ${productId} AND device_id = ${userId}
      LIMIT 1
    `

    const currentStock = existingDeviceStock.length > 0 ? Number(existingDeviceStock[0].stock || 0) : 0

    // Calculate new stock
    let newStock
    if (type === "increase") {
      newStock = currentStock + quantity
    } else {
      newStock = currentStock - quantity

      // Check if we have enough stock
      if (newStock < 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Insufficient stock for adjustment" }
      }
    }

    await upsertDeviceStock(productId, userId, newStock)

    const updatedProduct = {
      ...product[0],
      stock: newStock,
    }

    // Add stock history record
    try {
      await sql`
        INSERT INTO product_stock_history (
          product_id, quantity, type, reference_type, notes, created_by, device_id
        ) VALUES (
          ${productId}, ${quantity}, ${type === "increase" ? "adjustment" : "adjustment"}, 'manual', ${notes || "Manual stock adjustment"}, ${userId}, ${userId}
        )
      `
    } catch (error) {
      console.error("Stock history table might not exist:", error)
      // Continue execution even if this fails
    }

    // Commit the transaction
    await sql`COMMIT`

    return {
      success: true,
      message: `Stock ${type === "increase" ? "increased" : "decreased"} successfully`,
      data: updatedProduct,
    }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Adjust product stock error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}

// Add this function to the existing file
export async function getProductByBarcode(barcode: string, userId?: number) {

  if (!barcode) {
    return { success: false, message: "Barcode is required", data: null }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = userId
      ? await sql`
          SELECT 
            p.*,
            c.name as category_name
          FROM products p
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE p.barcode = ${barcode}
          AND p.created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
        `
      : await sql`
          SELECT 
            p.*,
            c.name as category_name
          FROM products p
          LEFT JOIN product_categories c ON p.category_id = c.id
          WHERE p.barcode = ${barcode}
        `

    if (result.length === 0) {
      return { success: false, message: "Product not found", data: null }
    }

    let resolvedStock = 0
    if (userId) {
      const deviceStock = await sql`
        SELECT stock
        FROM product_device_stock
        WHERE product_id = ${result[0].id} AND device_id = ${userId}
        LIMIT 1
      `
      if (deviceStock.length > 0) {
        resolvedStock = Number(deviceStock[0].stock || 0)
      }
    }

    // Include category from either category_id or legacy category field
    const product = {
      ...result[0],
      stock: resolvedStock,
      category: result[0].category_name || result[0].category || "",
    }

    const staff = userId ? await resolveStaffSessionContext(userId) : null
    return { success: true, data: filterProductForStaff(product, staff) }
  } catch (error) {
    console.error("Get product by barcode error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}

export async function getUserProducts(userId: number) {

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const products = await sql`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      WHERE p.created_by IN (
        SELECT d2.id
        FROM devices d1
        JOIN devices d2 ON d2.company_id = d1.company_id
        WHERE d1.id = ${userId}
      )
      ORDER BY p.name ASC
    `

    const deviceStocks = await sql`
      SELECT product_id, stock
      FROM product_device_stock
      WHERE device_id = ${userId}
    `
    const stockMap = new Map(deviceStocks.map((row) => [Number(row.product_id), Number(row.stock)]))

    // Map the results to include category and device-specific stock
    const mappedProducts = products.map((product) => ({
      ...product,
      stock: resolveDeviceStock(product, stockMap),
      category: product.category_name || product.category || "",
    }))

    return { success: true, data: await filterProductsForStaff(mappedProducts, userId) }
  } catch (error) {
    console.error("Get user products error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}


