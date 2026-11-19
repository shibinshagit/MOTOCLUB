export function cleanWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 10) {
    return `91${digits}`
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`
  }
  return digits
}

export function openCustomerWhatsApp(phone: string | null | undefined, message = "Hi"): boolean {
  const cleanPhone = cleanWhatsAppPhone(phone)
  if (!cleanPhone) {
    return false
  }

  const encodedMsg = encodeURIComponent(message)
  const url = `https://wa.me/${cleanPhone}?text=${encodedMsg}`
  window.open(url, "_blank", "noopener,noreferrer")
  return true
}

export function openWhatsApp(phone: string | null | undefined, message: string) {
  // Strip non-numeric from phone if provided
  const phoneNum = cleanWhatsAppPhone(phone)
  
  // Use api.whatsapp.com directly to avoid wa.me redirect mangling,
  // and use encodeURIComponent to ensure spaces become %20 (preferred by WA Web).
  let url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
  if (phoneNum) {
    url += `&phone=${phoneNum}`
  }

  window.open(url, "_blank", "noopener,noreferrer")
  return true
}
