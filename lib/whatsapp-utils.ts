export function openWhatsApp(phone: string | null | undefined, message: string) {
  // Strip non-numeric from phone if provided
  const phoneNum = phone ? phone.replace(/\D/g, "") : "";
  
  // Use api.whatsapp.com directly to avoid wa.me redirect mangling,
  // and use encodeURIComponent to ensure spaces become %20 (preferred by WA Web).
  let url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  if (phoneNum) {
    url += `&phone=${phoneNum}`;
  }

  window.open(url, "_blank");
  return true;
}
