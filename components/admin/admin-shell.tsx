"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ChevronLeft, LogOut, Menu, Palette, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { getCompanies, createCompany } from "@/app/actions/admin-actions"
import { adminLogout } from "@/app/actions/admin-auth-actions"
import AdminSidebar from "./admin-sidebar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormAlert } from "@/components/ui/form-alert"
import { Loader2 } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import BrandingSettingsDialog from "./branding-settings-dialog"
import { useBranding } from "@/components/branding-provider"
import {
  ADMIN_DIALOG_CONTENT_CLASS,
  ADMIN_DIALOG_INPUT_CLASS,
  ADMIN_DIALOG_LABEL_CLASS,
  ADMIN_DIALOG_MUTED_CLASS,
} from "@/lib/staff-restrictions"

interface AdminShellProps {
  children: React.ReactNode
}

export default function AdminShell({ children }: AdminShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const { platformName } = useBranding()
  const [companies, setCompanies] = useState<
    { id: number; name: string; address?: string; device_count?: number }[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isBrandingDialogOpen, setIsBrandingDialogOpen] = useState(false)

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true)
    setConnectionError(null)
    try {
      const result = await getCompanies()
      if (result.success) {
        setCompanies(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load companies")
        setConnectionError(result.message || "Failed to load companies")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      if (errorMessage.includes("Admin authentication required")) {
        router.push("/admin")
        router.refresh()
        return
      }
      notifyError(toast, errorMessage)
      setConnectionError(errorMessage)
      setCompanies([])
    } finally {
      setIsLoading(false)
    }
  }, [router, toast])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  const handleLogout = async () => {
    await adminLogout()
    router.push("/admin")
    router.refresh()
  }

  const handleCreateCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)
    try {
      const result = await createCompany(new FormData(e.currentTarget))
      if (result.success) {
        notifySuccess(toast, "Company created successfully")
        setIsAddDialogOpen(false)
        await fetchCompanies()
        if (result.data?.id) {
          router.push(`/admin/companies/${result.data.id}`)
        }
      } else {
        setFormError(result.message)
      }
    } catch {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const desktopSidebar = (
    <AdminSidebar
      companies={companies}
      isLoading={isLoading}
      collapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
    />
  )

  const mobileSidebar = (
    <AdminSidebar
      companies={companies}
      isLoading={isLoading}
      onClose={() => setMobileMenuOpen(false)}
    />
  )

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
          <BrandLogo variant="icon" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md" />
          <h1 className="text-base font-semibold text-gray-900">{platformName} Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="hidden sm:inline-flex"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add company
          </Button>
          <Button
            size="icon"
            onClick={() => setIsAddDialogOpen(true)}
            className="sm:hidden"
            aria-label="Add company"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBrandingDialogOpen(true)}
            className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
          >
            <Palette className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {connectionError && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
          <FormAlert
            type="warning"
            message={connectionError}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={fetchCompanies}
                className="border-amber-300 bg-white"
              >
                Retry
              </Button>
            }
          />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 md:block ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          {desktopSidebar}
        </aside>

        {mobileMenuOpen && (
          <div className="fixed inset-0 top-14 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            />
            <aside className="absolute left-0 top-0 h-full w-[min(100vw-3rem,18rem)] max-w-[85vw] border-r border-border bg-card shadow-xl">
              {mobileSidebar}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={`${ADMIN_DIALOG_CONTENT_CLASS} sm:max-w-md`}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Add company</DialogTitle>
            <DialogDescription className={ADMIN_DIALOG_MUTED_CLASS}>
              Create a new company in the system.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4">
            {formError && <FormAlert type="error" message={formError} />}
            <div className="space-y-2">
              <Label htmlFor="name" className={ADMIN_DIALOG_LABEL_CLASS}>
                Company name
              </Label>
              <Input id="name" name="name" required className={ADMIN_DIALOG_INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className={ADMIN_DIALOG_LABEL_CLASS}>
                Email
              </Label>
              <Input id="email" name="email" type="email" className={ADMIN_DIALOG_INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className={ADMIN_DIALOG_LABEL_CLASS}>
                Phone
              </Label>
              <Input id="phone" name="phone" className={ADMIN_DIALOG_INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className={ADMIN_DIALOG_LABEL_CLASS}>
                Address
              </Label>
              <Input id="address" name="address" className={ADMIN_DIALOG_INPUT_CLASS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className={ADMIN_DIALOG_LABEL_CLASS}>
                Description
              </Label>
              <Textarea id="description" name="description" rows={3} className={ADMIN_DIALOG_INPUT_CLASS} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create company"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <BrandingSettingsDialog open={isBrandingDialogOpen} onOpenChange={setIsBrandingDialogOpen} />
    </div>
  )
}
