"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { put } from "@vercel/blob"

// Ensures the products table exists before any query runs
async function ensureProductsTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        category VARCHAR(255),
        category_id INTEGER,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        wholesale_price DECIMAL(10, 2) DEFAULT 0,
        msp DECIMAL(10, 2) DEFAULT 0,
        stock INTEGER DEFAULT 0,
        barcode VARCHAR(255),
        image_url TEXT,
        shelf VARCHAR(255),
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Ensure new columns exist (for older schemas)
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(255)`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2) DEFAULT 0`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS msp DECIMAL(10, 2) DEFAULT 0`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf VARCHAR(255)`
  } catch (error) {
    console.error("Error ensuring products table:", error)
  }
}

// Ensures the product_categories table exists
async function ensureProductCategoriesTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  } catch (error) {
    console.error("Error ensuring product_categories table:", error)
  }
}

// Ensures the product_stock_history table exists
async function ensureProductStockHistoryTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS product_stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        reference_id INTEGER,
        reference_type VARCHAR(50),
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `
  } catch (error) {
    console.error("Error ensuring product_stock_history table:", error)
  }
}

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

// NEW: Updated getProducts function with limit and search functionality
export async function getProducts(userId?: number, limit?: number, searchTerm?: string) {
  resetConnectionState()
  await ensureProductsTable()
  await ensureProductCategoriesTable()

  console.log("getProducts called with:", { userId, limit, searchTerm })

  try {
    let products

    if (searchTerm && searchTerm.trim() !== "") {
      // Search with optional limit
      const searchPattern = `%${searchTerm.toLowerCase()}%`

      if (limit) {
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by = ${userId}
            AND (
              LOWER(p.name) LIKE ${searchPattern} OR
              LOWER(p.category) LIKE ${searchPattern} OR
              LOWER(p.company_name) LIKE ${searchPattern} OR
              LOWER(p.shelf) LIKE ${searchPattern} OR
              p.barcode LIKE ${searchPattern} OR
              p.id::text LIKE ${searchPattern}
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
            WHERE (
              LOWER(p.name) LIKE ${searchPattern} OR
              LOWER(p.category) LIKE ${searchPattern} OR
              LOWER(p.company_name) LIKE ${searchPattern} OR
              LOWER(p.shelf) LIKE ${searchPattern} OR
              p.barcode LIKE ${searchPattern} OR
              p.id::text LIKE ${searchPattern}
            )
            ORDER BY p.created_at DESC
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
            WHERE p.created_by = ${userId}
            AND (
              LOWER(p.name) LIKE ${searchPattern} OR
              LOWER(p.category) LIKE ${searchPattern} OR
              LOWER(p.company_name) LIKE ${searchPattern} OR
              LOWER(p.shelf) LIKE ${searchPattern} OR
              p.barcode LIKE ${searchPattern} OR
              p.id::text LIKE ${searchPattern}
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
            WHERE (
              LOWER(p.name) LIKE ${searchPattern} OR
              LOWER(p.category) LIKE ${searchPattern} OR
              LOWER(p.company_name) LIKE ${searchPattern} OR
              LOWER(p.shelf) LIKE ${searchPattern} OR
              p.barcode LIKE ${searchPattern} OR
              p.id::text LIKE ${searchPattern}
            )
            ORDER BY p.created_at DESC
          `
        }
      }
    } else {
      // Regular fetch with optional limit
      if (limit) {
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by = ${userId}
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
        // Fetch all
        if (userId) {
          products = await sql`
            SELECT 
              p.*,
              c.name as category_name
            FROM products p
            LEFT JOIN product_categories c ON p.category_id = c.id
            WHERE p.created_by = ${userId}
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

    // Map the results to include category from either category_id or legacy category field
    const mappedProducts = products.map((product) => ({
      ...product,
      category: product.category_name || product.category || "",
    }))

    console.log(`Found ${mappedProducts.length} products`)

    return { success: true, data: mappedProducts }
  } catch (error) {
    console.error("Get products error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function getProductById(id: number) {
  if (!id) {
    return { success: false, message: "Product ID is required", data: null }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()
  await ensureProductsTable()
  await ensureProductCategoriesTable()

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

    // Include category from either category_id or legacy category field
    const product = {
      ...result[0],
      category: result[0].category_name || result[0].category || "",
    }

    return { success: true, data: product }
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

// Updated function to check for duplicate products within the same user's products
async function checkProductDuplicates(name: string, barcode: string | null, userId: number, excludeId?: number) {
  try {
    // Check for duplicate name within user's products
    let nameQuery
    if (excludeId) {
      nameQuery = await sql`
        SELECT id FROM products 
        WHERE LOWER(name) = LOWER(${name}) 
        AND created_by = ${userId} 
        AND id != ${excludeId} 
        LIMIT 1
      `
    } else {
      nameQuery = await sql`
        SELECT id FROM products 
        WHERE LOWER(name) = LOWER(${name}) 
        AND created_by = ${userId} 
        LIMIT 1
      `
    }

    if (nameQuery.length > 0) {
      return {
        isDuplicate: true,
        field: "name",
        message: `A product with the name "${name}" already exists in your products.`,
      }
    }

    // Check for duplicate barcode within user's products (only if barcode is provided)
    if (barcode) {
      let barcodeQuery
      if (excludeId) {
        barcodeQuery = await sql`
          SELECT id FROM products 
          WHERE barcode = ${barcode} 
          AND created_by = ${userId} 
          AND id != ${excludeId} 
          LIMIT 1
        `
      } else {
        barcodeQuery = await sql`
          SELECT id FROM products 
          WHERE barcode = ${barcode} 
          AND created_by = ${userId} 
          LIMIT 1
        `
      }

      if (barcodeQuery.length > 0) {
        return {
          isDuplicate: true,
          field: "barcode",
          message: `A product with the barcode "${barcode}" already exists in your products.`,
        }
      }
    }

    return { isDuplicate: false }
  } catch (error) {
    console.error("Error checking for duplicates:", error)
    return { isDuplicate: false } // Default to allowing the operation if check fails
  }
}

// Update the createProduct function to handle FormData properly
export async function createProduct(formData: FormData) {
  await ensureProductsTable()
  await ensureProductCategoriesTable()
  await ensureProductStockHistoryTable()

  const name = formData.get("name") as string
  const companyName = formData.get("company_name") as string
  const category = formData.get("category") as string
  const categoryId = formData.get("category_id") ? Number(formData.get("category_id")) : null
  const price = Number.parseFloat(formData.get("price") as string)
  const wholesalePrice = Number.parseFloat(formData.get("wholesale_price") as string) || 0
  const msp = Number.parseFloat(formData.get("msp") as string) || 0
  const stock = Number.parseInt(formData.get("stock") as string) || 0
  const shelf = formData.get("shelf") as string
  const userId = Number(formData.get("user_id")) || 1 // Default user ID
  const barcode = (formData.get("barcode") as string) || null
  const imageFile = formData.get("image") as File | null

  if (!name || isNaN(price)) {
    return { success: false, error: "Name and valid price are required" }
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

    // Upload image if provided
    let imageUrl = null
    if (imageFile && imageFile.size > 0) {
      try {
        imageUrl = await uploadProductImage(imageFile, name)
      } catch (error) {
        console.error("Image upload error:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to upload product image",
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
            stock, 
            shelf,
            image_url,
            created_by,
            barcode
          )
          VALUES (
            ${name}, 
            ${companyName || ""},
            ${category || ""}, 
            ${categoryId}, 
            ${""}, 
            ${price},
            ${wholesalePrice},
            ${msp},
            ${stock}, 
            ${shelf || ""},
            ${imageUrl},
            ${userId},
            ${barcode}
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

        // Always add a stock history record for initial stock (even if 0)
        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, quantity, type, reference_type, notes, created_by
            ) VALUES (
              ${productId}, ${stock}, 'adjustment', 'manual', 'Initial stock', ${userId}
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
  await ensureProductsTable()
  await ensureProductCategoriesTable()
  await ensureProductStockHistoryTable()

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
  const userId = formData.get("user_id") ? Number.parseInt(formData.get("user_id") as string) : undefined

  if (!id || !name || isNaN(price)) {
    return { success: false, message: "ID, name, and valid price are required" }
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

    // Check for duplicates within user's products before proceeding
    const duplicateCheck = await checkProductDuplicates(name, barcode, productUserId, id)
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        message: duplicateCheck.message,
        field: duplicateCheck.field,
      }
    }

    // Upload new image if provided
    let imageUrl = currentProduct[0].image_url // Keep existing image by default
    if (imageFile && imageFile.size > 0) {
      try {
        const newImageUrl = await uploadProductImage(imageFile, name)
        if (newImageUrl) {
          imageUrl = newImageUrl
        }
      } catch (error) {
        console.error("Image upload error during update:", error)
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to upload product image",
        }
      }
    }

    // Start a transaction
    await sql`BEGIN`

    const oldStock = currentProduct[0].stock

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
          stock = ${stock}, 
          shelf = ${shelf || ""},
          image_url = ${imageUrl},
          barcode = ${barcode || currentProduct[0].barcode}
        WHERE id = ${id}
        AND created_by = ${userId}
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
          stock = ${stock}, 
          shelf = ${shelf || ""},
          image_url = ${imageUrl},
          barcode = ${barcode || currentProduct[0].barcode}
        WHERE id = ${id}
        RETURNING *
      `
    }

    if (result.length > 0) {
      // If stock has changed, add a stock history record
      if (stock !== oldStock) {
        const adjustmentQuantity = stock - oldStock
        const adjustmentType = adjustmentQuantity > 0 ? "adjustment" : "adjustment"

        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, quantity, type, reference_type, notes, created_by
            ) VALUES (
              ${id}, ${Math.abs(adjustmentQuantity)}, ${adjustmentType}, 'manual', 'Stock adjustment from product edit', ${userId || currentProduct[0].created_by}
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
      updatedProduct.category = categoryName

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
  await ensureProductsTable()
  await ensureProductStockHistoryTable()

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

// Add getProductStockHistory function
export async function getProductStockHistory(productId: number) {
  await ensureProductStockHistoryTable()

  if (!productId) {
    return { success: false, message: "Product ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Get stock history from the dedicated table
    try {
      const history = await sql`
        SELECT 
          id, 
          product_id, 
          quantity, 
          type, 
          reference_id, 
          reference_type, 
          notes, 
          created_at as date
        FROM product_stock_history
        WHERE product_id = ${productId}
        ORDER BY created_at DESC
      `
      return { success: true, data: history }
    } catch (error) {
      console.error("Stock history table might not exist:", error)
      return { success: true, data: [] }
    }
  } catch (error) {
    console.error("Get product stock history error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function adjustProductStock(formData: FormData) {
  await ensureProductsTable()
  await ensureProductStockHistoryTable()

  const productId = Number.parseInt(formData.get("product_id") as string)
  const quantity = Number.parseInt(formData.get("quantity") as string)
  const type = formData.get("type") as string // 'increase' or 'decrease'
  const notes = formData.get("notes") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  if (!productId || isNaN(quantity) || quantity <= 0 || !type) {
    return { success: false, message: "Product ID, valid quantity, and adjustment type are required" }
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

    // Calculate new stock
    let newStock
    if (type === "increase") {
      newStock = product[0].stock + quantity
    } else {
      newStock = product[0].stock - quantity

      // Check if we have enough stock
      if (newStock < 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Insufficient stock for adjustment" }
      }
    }

    // Update product stock
    const updatedProduct = await sql`
      UPDATE products
      SET stock = ${newStock}
      WHERE id = ${productId}
      RETURNING *
    `

    // Add stock history record
    try {
      await sql`
        INSERT INTO product_stock_history (
          product_id, quantity, type, reference_type, notes, created_by
        ) VALUES (
          ${productId}, ${quantity}, ${type === "increase" ? "adjustment" : "adjustment"}, 'manual', ${notes || "Manual stock adjustment"}, ${userId}
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
      data: updatedProduct[0],
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
export async function getProductByBarcode(barcode: string) {
  await ensureProductsTable()
  await ensureProductCategoriesTable()

  if (!barcode) {
    return { success: false, message: "Barcode is required", data: null }
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
      WHERE p.barcode = ${barcode}
    `

    if (result.length === 0) {
      return { success: false, message: "Product not found", data: null }
    }

    // Include category from either category_id or legacy category field
    const product = {
      ...result[0],
      category: result[0].category_name || result[0].category || "",
    }

    return { success: true, data: product }
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
  await ensureProductsTable()
  await ensureProductCategoriesTable()

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const products = await sql`
      SELECT 
        p.*,
        c.name as category_name
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      WHERE p.created_by = ${userId}
      ORDER BY p.name ASC
    `

    // Map the results to include category from either category_id or legacy category field
    const mappedProducts = products.map((product) => ({
      ...product,
      category: product.category_name || product.category || "",
    }))

    return { success: true, data: mappedProducts }
  } catch (error) {
    console.error("Get user products error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}
