// Canonical public URL of the ERP, used in links sent to customers
// (shipment tracking pages, WhatsApp messages, product share links).
export const PRODUCTION_APP_URL = "https://ims.motocart.store"

/** NEXT_PUBLIC_APP_URL without a trailing slash, or null when it is not set. */
export function getConfiguredAppUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || null
}
