import type { ReactNode } from "react"
import Link from "next/link"
import { LEGAL_DETAILS, LEGAL_PLACEHOLDERS, PRIVACY_POLICY_PATH, TERMS_PATH, type LegalDetailKey } from "@/lib/legal"

/** Renders a business detail, or a highlighted placeholder until it is filled in lib/legal.ts. */
export function Detail({ name }: { name: LegalDetailKey }) {
  const value = LEGAL_DETAILS[name]
  if (value) return <>{value}</>
  return (
    <mark className="rounded bg-amber-100 px-1 font-medium text-amber-900">[{LEGAL_PLACEHOLDERS[name]}]</mark>
  )
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-sm font-medium text-slate-500">
            <Detail name="tradingName" />
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Effective date: <Detail name="effectiveDate" /> · Last updated: <Detail name="lastUpdated" />
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <article className="space-y-8 rounded-2xl border border-slate-200 bg-white p-5 text-[15px] leading-relaxed text-slate-700 shadow-sm sm:p-8 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:text-blue-700 [&_a]:underline">
          {children}
        </article>
      </main>

      <LegalLinks className="pb-8" />
    </div>
  )
}

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex justify-center gap-4 text-xs font-medium text-slate-500 ${className}`}>
      <Link href={PRIVACY_POLICY_PATH} className="hover:text-slate-800 hover:underline">
        Privacy Policy
      </Link>
      <Link href={TERMS_PATH} className="hover:text-slate-800 hover:underline">
        Terms &amp; Conditions
      </Link>
    </nav>
  )
}

export function ContactBlock() {
  return (
    <ul>
      <li>
        <Detail name="legalName" /> (trading as <Detail name="tradingName" />)
      </li>
      <li>
        Address: <Detail name="registeredAddress" />
      </li>
      <li>
        Email: <Detail name="contactEmail" />
      </li>
      <li>
        Phone: <Detail name="contactPhone" />
      </li>
    </ul>
  )
}
