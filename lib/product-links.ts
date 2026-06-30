export type ProductLinkEntry = {
  name: string
  url: string
}

export const DEFAULT_PRODUCT_LINK_NAME = "Link"

function normalizeEntry(entry: unknown): ProductLinkEntry | null {
  if (!entry || typeof entry !== "object") return null
  const record = entry as Record<string, unknown>
  const url = typeof record.url === "string" ? record.url.trim() : ""
  if (!url) return null
  const name =
    typeof record.name === "string" && record.name.trim() ? record.name.trim() : DEFAULT_PRODUCT_LINK_NAME
  return { name, url }
}

export function parseProductLinks(raw: unknown): ProductLinkEntry[] {
  if (!raw) return []

  if (Array.isArray(raw)) {
    return raw.map(normalizeEntry).filter((entry): entry is ProductLinkEntry => entry !== null)
  }

  if (typeof raw !== "string") return []

  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeEntry).filter((entry): entry is ProductLinkEntry => entry !== null)
      }
    } catch {
      return []
    }
  }

  return [{ name: DEFAULT_PRODUCT_LINK_NAME, url: trimmed }]
}

export function normalizeProductLinksForSave(links: ProductLinkEntry[]): ProductLinkEntry[] {
  return links
    .map((entry) => {
      const url = entry.url.trim()
      if (!url) return null
      const name = entry.name.trim() || DEFAULT_PRODUCT_LINK_NAME
      return { name, url }
    })
    .filter((entry): entry is ProductLinkEntry => entry !== null)
}

export function serializeProductLinks(links: ProductLinkEntry[]): string {
  const normalized = normalizeProductLinksForSave(links)
  if (normalized.length === 0) return ""
  return JSON.stringify(normalized)
}

export function parseProductLinksFromFormData(formData: FormData): ProductLinkEntry[] {
  const linksRaw = formData.get("links") as string | null
  if (linksRaw) {
    try {
      const parsed = JSON.parse(linksRaw)
      return normalizeProductLinksForSave(Array.isArray(parsed) ? parsed : [])
    } catch {
      return []
    }
  }

  const legacyLink = (formData.get("link") as string) || ""
  return parseProductLinks(legacyLink)
}

export function migrateStoredProductLink(raw: unknown): string {
  const links = parseProductLinks(raw)
  return serializeProductLinks(links)
}
