"use client"

import { LogOut } from "lucide-react"
import { staffLogout } from "@/app/actions/staff-auth-actions"
import { useRouter } from "next/navigation"

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await staffLogout()
    router.push("/")
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors w-full text-left font-medium"
    >
      <LogOut className="h-5 w-5" />
      Logout
    </button>
  )
}
