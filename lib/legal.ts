import { PRODUCTION_APP_URL } from "@/lib/app-url"

export const PRIVACY_POLICY_PATH = "/privacy-policy"
export const TERMS_PATH = "/terms-and-conditions"

export const PRIVACY_POLICY_URL = `${PRODUCTION_APP_URL}${PRIVACY_POLICY_PATH}`
export const TERMS_URL = `${PRODUCTION_APP_URL}${TERMS_PATH}`

// Business details shown on the public legal pages. Every value left as null is
// rendered as a highlighted placeholder, so the pages must not be submitted to
// Meta until the business team has filled these in and legal has reviewed the text.
export const LEGAL_DETAILS: Record<LegalDetailKey, string | null> = {
  tradingName: "MOTO CART ONLINE",
  legalName: "MOTO CART",
  registeredAddress: "MOTO CART, CHANGUVETTY, KOTTAKKAL, MALAPPURAM, KERALA, INDIA, PIN: 676503",
  contactEmail: "murshidkallen@gmail.com",
  contactPhone: "+91 8547315581",
  effectiveDate: "1 January 2026",
  lastUpdated: "15 October 2026",
  retentionPeriod: null,
  requestResponseTime: null,
  governingLaw: "the laws of Kerala, India",
}

export type LegalDetailKey =
  | "tradingName"
  | "legalName"
  | "registeredAddress"
  | "contactEmail"
  | "contactPhone"
  | "effectiveDate"
  | "lastUpdated"
  | "retentionPeriod"
  | "requestResponseTime"
  | "governingLaw"

export const LEGAL_PLACEHOLDERS: Record<LegalDetailKey, string> = {
  tradingName: "Business / trading name",
  legalName: "Registered legal entity name",
  registeredAddress: "Registered business address",
  contactEmail: "Privacy contact email",
  contactPhone: "Contact phone number",
  effectiveDate: "Effective date",
  lastUpdated: "Last updated date",
  retentionPeriod: "How long lead records are kept",
  requestResponseTime: "Response time for privacy requests",
  governingLaw: "Governing law and jurisdiction",
}
