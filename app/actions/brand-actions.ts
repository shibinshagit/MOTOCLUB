"use server"

import { del, put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { sql } from "@/lib/db"
import { EMPTY_PLATFORM_BRANDING, type PlatformBranding } from "@/lib/platform-branding"
import { requireAdmin } from "@/app/actions/admin-auth-actions"

function mapBrandingRow(row: { brand_logo_url?: string | null; brand_icon_url?: string | null } | undefined): PlatformBranding {
  return {
    logoUrl: row?.brand_logo_url || null,
    iconUrl: row?.brand_icon_url || null,
  }
}

async function uploadBrandingImage(file: File, kind: "logo" | "icon"): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error("Blob storage is not configured")
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "png"
  const filename = `branding/${kind}.${extension}`

  const blob = await put(filename, file, {
    access: "public",
    token,
    addRandomSuffix: false,
  })

  return blob.url
}

async function deleteBlobIfManaged(url: string | null | undefined) {
  if (!url || !url.includes("blob.vercel-storage.com")) return

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return

  try {
    await del(url, { token })
  } catch (error) {
    console.warn("Failed to delete old branding blob:", error)
  }
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  try {
    const rows = await sql`
      SELECT brand_logo_url, brand_icon_url
      FROM platform_settings
      WHERE id = 1
      LIMIT 1
    `

    return mapBrandingRow(rows[0] as { brand_logo_url?: string | null; brand_icon_url?: string | null })
  } catch (error) {
    console.error("Error loading platform branding:", error)
    return { ...EMPTY_PLATFORM_BRANDING }
  }
}

export async function getDefaultCompanyLogo(): Promise<string | null> {
  const branding = await getPlatformBranding()
  return branding.iconUrl || branding.logoUrl || null
}

export async function updatePlatformBranding(formData: FormData) {
  try {
    await requireAdmin()

    const existingRows = await sql`
      SELECT brand_logo_url, brand_icon_url
      FROM platform_settings
      WHERE id = 1
      LIMIT 1
    `
    const existing = mapBrandingRow(
      existingRows[0] as { brand_logo_url?: string | null; brand_icon_url?: string | null },
    )

    const logoFile = formData.get("brandLogo")
    const iconFile = formData.get("brandIcon")
    const removeLogo = formData.get("removeLogo") === "true"
    const removeIcon = formData.get("removeIcon") === "true"

    let brandLogoUrl = existing.logoUrl
    let brandIconUrl = existing.iconUrl

    if (removeLogo) {
      await deleteBlobIfManaged(brandLogoUrl)
      brandLogoUrl = null
    } else if (logoFile instanceof File && logoFile.size > 0) {
      if (!logoFile.type.startsWith("image/")) {
        return { success: false, message: "Full logo must be an image file" }
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return { success: false, message: "Full logo must be 5MB or smaller" }
      }
      await deleteBlobIfManaged(brandLogoUrl)
      brandLogoUrl = await uploadBrandingImage(logoFile, "logo")
    }

    if (removeIcon) {
      await deleteBlobIfManaged(brandIconUrl)
      brandIconUrl = null
    } else if (iconFile instanceof File && iconFile.size > 0) {
      if (!iconFile.type.startsWith("image/")) {
        return { success: false, message: "Icon must be an image file" }
      }
      if (iconFile.size > 5 * 1024 * 1024) {
        return { success: false, message: "Icon must be 5MB or smaller" }
      }
      await deleteBlobIfManaged(brandIconUrl)
      brandIconUrl = await uploadBrandingImage(iconFile, "icon")
    }

    await sql`
      UPDATE platform_settings
      SET
        brand_logo_url = ${brandLogoUrl},
        brand_icon_url = ${brandIconUrl},
        updated_at = NOW()
      WHERE id = 1
    `

    revalidatePath("/")
    revalidatePath("/admin")
    revalidatePath("/dashboard")

    return {
      success: true,
      message: "Software branding updated",
      data: {
        logoUrl: brandLogoUrl,
        iconUrl: brandIconUrl,
      } satisfies PlatformBranding,
    }
  } catch (error) {
    console.error("Error updating platform branding:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update branding",
    }
  }
}
