"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"

export interface Category {
  id: number
  name: string
  description?: string
  parent_id?: number | null
  parent_name?: string | null
  created_by?: number
  created_at?: string
  updated_at?: string
}

export async function getCategories(userId?: number) {
  resetConnectionState()

  try {
    let categories

    if (userId) {
      categories = await sql`
        SELECT 
          c.*,
          p.name as parent_name
        FROM product_categories c
        LEFT JOIN product_categories p ON c.parent_id = p.id
        WHERE c.created_by = ${userId}
        ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.name ASC
      `

      if (categories.length === 0) {
        console.log(`No categories found for user ID: ${userId}`)
        return { success: true, data: [] }
      }
    } else {
      categories = await sql`
        SELECT 
          c.*,
          p.name as parent_name
        FROM product_categories c
        LEFT JOIN product_categories p ON c.parent_id = p.id
        ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.name ASC
      `
    }

    return { success: true, data: categories }
  } catch (error) {
    console.error("Get categories error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function createCategory(formData: FormData | { name: string; description?: string; userId?: number; parentId?: number | null }) {
  let name: string
  let description: string | null = null
  let userId: number | null = null
  let parentId: number | null = null

  if (formData instanceof FormData) {
    name = formData.get("name") as string
    description = (formData.get("description") as string) || null
    userId = formData.get("user_id") ? Number(formData.get("user_id")) : null
    parentId = formData.get("parent_id") ? Number(formData.get("parent_id")) : null
  } else {
    name = formData.name
    description = formData.description || null
    userId = formData.userId || null
    parentId = formData.parentId || null
  }

  if (!name) {
    return { success: false, message: "Category name is required", data: null }
  }

  resetConnectionState()

  try {
    const existingCategory = await sql`
      SELECT * FROM product_categories WHERE LOWER(name) = LOWER(${name}) AND COALESCE(parent_id, 0) = COALESCE(${parentId}, 0)
    `

    if (existingCategory.length > 0) {
      return { success: true, message: "Category already exists", data: existingCategory[0] }
    }

    const result = await sql`
      INSERT INTO product_categories (name, description, parent_id, created_by)
      VALUES (${name}, ${description}, ${parentId}, ${userId})
      RETURNING *
    `

    if (result.length > 0) {
      if (parentId) {
        const parent = await sql`SELECT name FROM product_categories WHERE id = ${parentId}`
        result[0].parent_name = parent.length > 0 ? parent[0].name : null
      }
      return { success: true, message: "Category created successfully", data: result[0] }
    }

    return { success: false, message: "Failed to create category", data: null }
  } catch (error) {
    console.error("Create category error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}

// Update a category
export async function updateCategory(formData: FormData | { id: number; name: string; description?: string }) {
  let id: number
  let name: string
  let description: string | null = null

  // Handle both FormData and direct object input
  if (formData instanceof FormData) {
    id = Number(formData.get("id"))
    name = formData.get("name") as string
    description = (formData.get("description") as string) || null
  } else {
    id = formData.id
    name = formData.name
    description = formData.description || null
  }

  if (!id || !name) {
    return { success: false, message: "Category ID and name are required", data: null }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await sql`
      UPDATE product_categories
      SET name = ${name}, description = ${description}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length > 0) {
      // Remove revalidatePath to prevent redirection
      return { success: true, message: "Category updated successfully", data: result[0] }
    }

    return { success: false, message: "Failed to update category", data: null }
  } catch (error) {
    console.error("Update category error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}

// Delete a category
export async function deleteCategory(id: number) {
  if (!id) {
    console.error("Delete category error: No ID provided")
    return { success: false, message: "Category ID is required" }
  }

  console.log(`Attempting to delete category with ID: ${id}`)

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check if category is used in any products
    console.log("Checking if category is used in products...")
    const products = await sql`SELECT id FROM products WHERE category_id = ${id}`
    console.log(`Found ${products.length} products using this category`)

    if (products.length > 0) {
      console.log("Cannot delete: Category is used by products")
      return {
        success: false,
        message: "Cannot delete category that is used by products. Please reassign products first.",
      }
    }

    console.log("Executing DELETE query...")
    const result = await sql`DELETE FROM product_categories WHERE id = ${id} RETURNING id`
    console.log("Delete query result:", result)

    if (result && result.length > 0) {
      console.log("Category deleted successfully")
      return { success: true, message: "Category deleted successfully" }
    }

    console.log("Delete failed: No rows affected")
    return { success: false, message: "Failed to delete category. Category may not exist." }
  } catch (error) {
    console.error("Delete category database error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
