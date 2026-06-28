"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Building2, LogOut, Plus, ChevronLeft, ChevronRight, Menu, X, AlertTriangle, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { getCompanies, createCompany } from "@/app/actions/admin-actions"
import CompanyList from "./company-list"
import CompanyDetails from "./company-details"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import BrandingSettingsDialog from "./branding-settings-dialog"
import { BRAND_NAME } from "@/lib/brand"
import {
  ADMIN_DIALOG_CONTENT_CLASS,
  ADMIN_DIALOG_INPUT_CLASS,
  ADMIN_DIALOG_LABEL_CLASS,
  ADMIN_DIALOG_MUTED_CLASS,
} from "@/lib/staff-restrictions"
type Company = {
  id: number
  name: string
  address?: string
  phone?: string
  email?: string
  description?: string
  logo_url?: string
  device_count?: number
}

type ViewMode = "list" | "details"

interface AdminDashboardProps {
  onLogout: () => void | Promise<void>
  adminName?: string | null
}

export default function AdminDashboard({ onLogout, adminName }: AdminDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [usingMockData, setUsingMockData] = useState(false)
  const [isBrandingDialogOpen, setIsBrandingDialogOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    setIsLoading(true)
    setConnectionError(null)
    try {
      const result = await getCompanies()
      if (result.success) {
        setCompanies(result.data || [])
        if (result.message?.includes("mock")) {
          setUsingMockData(true)
          setConnectionError("Using mock data due to database connection issues")
        }
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to load companies",
          variant: "destructive",
        })
        setConnectionError(result.message || "Failed to load companies")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      toast({ title: "Error", description: errorMessage, variant: "destructive" })
      setConnectionError(errorMessage)
      setCompanies([
        {
          id: 1,
          name: "Demo Company (Offline Mode)",
          email: "info@example.com",
          phone: "+971 50 123 4567",
          address: "Dubai, UAE",
          description: "Retail company",
          logo_url: "",
          device_count: 5,
        },
      ])
      setUsingMockData(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company)
    setViewMode("details")
    setMobileMenuOpen(false)
  }

  const handleCompanyUpdate = (updatedCompany: Company) => {
    setCompanies(companies.map((c) => (c.id === updatedCompany.id ? updatedCompany : c)))
    setSelectedCompany(updatedCompany)
  }

  const handleBackToCompanyList = () => {
    setSelectedCompany(null)
    setViewMode("list")
    fetchCompanies()
  }

  const handleCreateCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)
    try {
      const result = await createCompany(new FormData(e.currentTarget))
      if (result.success) {
        toast({ title: "Success", description: "Company created successfully" })
        setIsAddDialogOpen(false)
        fetchCompanies()
      } else {
        setFormError(result.message)
      }
    } catch {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const sidebarCompanyButton = (company: Company, collapsed: boolean) => (
    <button
      key={company.id}
      onClick={() => handleCompanySelect(company)}
      className={`w-full rounded-lg border border-transparent p-3 text-left transition-colors hover:border-gray-200 hover:bg-gray-50 ${
        selectedCompany?.id === company.id ? "border-gray-200 bg-gray-50" : ""
      }`}
    >
      {collapsed ? (
        <div className="flex justify-center">
          <Building2 className="h-5 w-5 text-gray-500" />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 shrink-0 text-gray-500" />
          <p className="truncate text-sm font-medium text-gray-900">{company.name}</p>
        </div>
      )}
    </button>
  )

  return (
    <div className="flex h-screen w-full flex-col bg-gray-50">
      <header className="z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <BrandLogo variant="icon" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md" />
          <div>
            <h1 className="text-base font-semibold text-gray-900">{BRAND_NAME} Admin</h1>
            {adminName && <p className="text-xs text-gray-500">{adminName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBrandingDialogOpen(true)}
            className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
          >
            <Palette className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-gray-600 hover:bg-red-50 hover:text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
        </div>
      </header>

      {connectionError && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1 text-sm">
            <p>{connectionError}</p>
            {usingMockData && <p className="text-xs text-amber-700">Using demo data. Some features may be limited.</p>}
          </div>
          <Button variant="outline" size="sm" onClick={fetchCompanies} className="border-amber-300 bg-white">
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`hidden border-r border-gray-200 bg-white transition-all duration-200 md:block ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3">
              {!sidebarCollapsed && <h2 className="text-sm font-medium text-gray-700">Companies</h2>}
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {viewMode === "list" && (
                <Button onClick={() => setIsAddDialogOpen(true)} className={`mb-3 w-full ${sidebarCollapsed ? "px-0" : ""}`} size={sidebarCollapsed ? "icon" : "default"}>
                  <Plus className={`h-4 w-4 ${sidebarCollapsed ? "" : "mr-2"}`} />
                  {!sidebarCollapsed && "Add company"}
                </Button>
              )}
              {viewMode === "details" && (
                <Button onClick={handleBackToCompanyList} variant="outline" className={`mb-3 w-full border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 ${sidebarCollapsed ? "px-0" : ""}`} size={sidebarCollapsed ? "icon" : "default"}>
                  <ChevronLeft className={`h-4 w-4 ${sidebarCollapsed ? "" : "mr-2"}`} />
                  {!sidebarCollapsed && "Back"}
                </Button>
              )}
              {!isLoading && viewMode === "list" && companies.length > 0 && (
                <div className="space-y-1">{companies.map((c) => sidebarCompanyButton(c, sidebarCollapsed))}</div>
              )}
            </div>
          </div>
        </aside>

        {mobileMenuOpen && <div className="absolute inset-0 top-14 z-10 bg-black/20 md:hidden" onClick={() => setMobileMenuOpen(false)} />}

        <aside
          className={`absolute left-0 top-14 z-20 h-[calc(100%-3.5rem)] w-72 transform border-r border-gray-200 bg-white transition-transform md:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col p-3">
            <h2 className="mb-3 px-1 text-sm font-medium text-gray-700">Companies</h2>
            {viewMode === "list" && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="mb-3 w-full">
                <Plus className="mr-2 h-4 w-4" /> Add company
              </Button>
            )}
            {viewMode === "details" && (
              <Button onClick={handleBackToCompanyList} variant="outline" className="mb-3 w-full border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900">
                <ChevronLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            )}
            {!isLoading && viewMode === "list" && (
              <div className="space-y-1 overflow-y-auto">{companies.map((c) => sidebarCompanyButton(c, false))}</div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {viewMode === "list" ? (
            <>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">Companies</h2>
                  <p className="text-sm text-gray-500">Manage registered companies and their devices</p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)} className="md:hidden">
                  <Plus className="mr-2 h-4 w-4" /> Add company
                </Button>
              </div>
              <CompanyList companies={companies} isLoading={isLoading} onSelect={handleCompanySelect} />
            </>
          ) : (
            selectedCompany && (
              <>
                <div className="mb-6 flex items-center gap-3 md:hidden">
                  <Button onClick={handleBackToCompanyList} variant="outline" size="sm" className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900">
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedCompany.name}</h2>
                </div>
                <CompanyDetails company={selectedCompany} onBack={handleBackToCompanyList} onUpdate={handleCompanyUpdate} />
              </>
            )
          )}
        </main>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={`${ADMIN_DIALOG_CONTENT_CLASS} sm:max-w-md`}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Add company</DialogTitle>
            <DialogDescription className={ADMIN_DIALOG_MUTED_CLASS}>Create a new company in the system.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2"><Label htmlFor="name" className={ADMIN_DIALOG_LABEL_CLASS}>Company name</Label><Input id="name" name="name" required className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="space-y-2"><Label htmlFor="email" className={ADMIN_DIALOG_LABEL_CLASS}>Email</Label><Input id="email" name="email" type="email" className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="space-y-2"><Label htmlFor="phone" className={ADMIN_DIALOG_LABEL_CLASS}>Phone</Label><Input id="phone" name="phone" className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="space-y-2"><Label htmlFor="address" className={ADMIN_DIALOG_LABEL_CLASS}>Address</Label><Input id="address" name="address" className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="space-y-2"><Label htmlFor="description" className={ADMIN_DIALOG_LABEL_CLASS}>Description</Label><Textarea id="description" name="description" rows={3} className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="space-y-2"><Label htmlFor="logo_url" className={ADMIN_DIALOG_LABEL_CLASS}>Logo URL</Label><Input id="logo_url" name="logo_url" placeholder="https://..." className={ADMIN_DIALOG_INPUT_CLASS} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create company"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <BrandingSettingsDialog open={isBrandingDialogOpen} onOpenChange={setIsBrandingDialogOpen} />
    </div>
  )
}
