import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Staff Dashboard",
  description: "Staff portal for managing daily activities",
}

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* The Sidebar and Topbar will be implemented in the Dashboard component directly, 
          similar to the main Dashboard structure. */}
      {children}
    </div>
  )
}
