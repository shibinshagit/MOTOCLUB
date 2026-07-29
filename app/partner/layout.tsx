import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Partner Portal",
  description: "Portal for partners",
}

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {children}
    </div>
  )
}
