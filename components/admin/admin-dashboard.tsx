"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Building2, LogOut, Plus, ChevronLeft, ChevronRight, Menu, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { getCompanies } from "@/app/actions/admin-actions"
import CompanyList from "./company-list"
import CompanyDetails from "./company-details"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"
import { createCompany } from "@/app/actions/admin-actions"
import Image from "next/image"
import { setupDeviceCurrencyTable } from "@/app/actions/setup-device-currency"

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
  onLogout: () => void
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
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
  const { toast } = useToast()

  useEffect(() => {
    fetchCompanies()
  }, [])

  // Run the device currency table migration
  useEffect(() => {
    const setupCurrencyTable = async () => {
      try {
        await setupDeviceCurrencyTable()
      } catch (error) {
        console.error("Error setting up device currency table:", error)
      }
    }

    setupCurrencyTable()
  }, [])

  const fetchCompanies = async () => {
    setIsLoading(true)
    setConnectionError(null)
    try {
      const result = await getCompanies()
      if (result.success) {
        setCompanies(result.data || [])

        // Check if we're using mock data
        if (result.message && result.message.includes("mock")) {
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
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      setConnectionError(errorMessage)

      // Set some mock data as fallback
      setCompanies([
        {
          id: 1,
          name: "Al Aneeq (Offline Mode)",
          email: "info@alaneeq.com",
          phone: "+971 50 123 4567",
          address: "Dubai, UAE",
          description: "Retail company specializing in fashion",
          logo_url: "/images/al-aneeq-logo.png",
          device_count: 5,
        },
        {
          id: 2,
          name: "Fashion Hub (Offline Mode)",
          email: "contact@fashionhub.com",
          phone: "+971 50 987 6543",
          address: "Abu Dhabi, UAE",
          description: "Premium fashion retailer",
          logo_url: "",
          device_count: 3,
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
    // Update the company in the companies list
    setCompanies(companies.map((c) => (c.id === updatedCompany.id ? updatedCompany : c)))
    // Update the selected company
    setSelectedCompany(updatedCompany)
  }

  const handleBackToCompanyList = () => {
    setSelectedCompany(null)
    setViewMode("list")
    // Refresh the companies list
    fetchCompanies()
  }

  const handleCreateCompany = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData(e.currentTarget)

      const result = await createCompany(formData)

      if (result.success) {
        toast({
          title: "Success",
          description: "Company created successfully",
        })
        setIsAddDialogOpen(false)
        fetchCompanies() // Refresh the companies list
      } else {
        setFormError(result.message)
      }
    } catch (error) {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#0F172A] text-white">
      {/* Header */}
      <header className="z-20 flex h-16 items-center justify-between border-b border-[#1E293B] bg-[#1E293B] px-4 shadow-lg">
        <div className="flex items-center">
          <button onClick={toggleMobileMenu} className="mr-4 rounded-md p-1 text-white hover:bg-[#334155] md:hidden">
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="relative h-8 w-8 mr-3">
            <Image
              src="https://www.opencoders.icu/oc.png"
              alt="EzzyCartz Logo"
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
          <h1 className="font-orbitron text-xl font-bold tracking-wider text-white">
            EZZY<span className="text-[#6366F1]">CARTZ</span> ADMIN
          </h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="flex items-center gap-2 text-red-400 hover:bg-red-900/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">LOGOUT</span>
        </Button>
      </header>

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-amber-900/30 border border-amber-700 text-amber-200 px-4 py-2 flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm">{connectionError}</p>
            {usingMockData && <p className="text-xs mt-1">Using demo data. Some features may be limited.</p>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCompanies}
            className="ml-2 border-amber-700 text-amber-200 hover:bg-amber-800 hover:text-amber-100"
          >
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Desktop */}
        <aside
          className={`hidden border-r border-[#1E293B] bg-[#1E293B] transition-all duration-300 md:block ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-[#334155] p-4">
              <h2 className={`font-orbitron text-lg font-bold text-white ${sidebarCollapsed ? "hidden" : "block"}`}>
                COMMAND CENTER
              </h2>
              <button
                onClick={toggleSidebar}
                className="rounded-md p-1 text-[#94A3B8] hover:bg-[#334155] hover:text-white"
              >
                {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {viewMode === "list" && !sidebarCollapsed && (
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="mb-4 w-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>ADD COMPANY</span>
                </Button>
              )}

              {viewMode === "list" && sidebarCollapsed && (
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="mb-4 w-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] p-2 hover:from-[#4F46E5] hover:to-[#7C3AED]"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}

              {viewMode === "details" && (
                <Button
                  onClick={handleBackToCompanyList}
                  className="mb-4 w-full bg-[#334155] hover:bg-[#475569]"
                  variant="outline"
                >
                  <ChevronLeft className={`h-4 w-4 ${!sidebarCollapsed && "mr-2"}`} />
                  {!sidebarCollapsed && <span>BACK</span>}
                </Button>
              )}

              {/* Company list in sidebar for desktop */}
              {!isLoading && viewMode === "list" && companies.length > 0 && (
                <div className="space-y-2">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => handleCompanySelect(company)}
                      className="w-full rounded-md border border-[#334155] bg-[#1E293B] p-3 text-left transition-all hover:border-[#6366F1] hover:bg-[#334155]"
                    >
                      {sidebarCollapsed ? (
                        <div className="flex justify-center">
                          <Building2 className="h-6 w-6 text-[#6366F1]" />
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <Building2 className="mr-3 h-5 w-5 text-[#6366F1]" />
                          <div className="overflow-hidden">
                            <p className="truncate font-medium text-white">{company.name}</p>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="absolute inset-0 z-10 bg-black/50 md:hidden" onClick={toggleMobileMenu}></div>
        )}

        {/* Sidebar - Mobile */}
        <aside
          className={`absolute left-0 top-16 z-10 h-[calc(100%-4rem)] w-64 transform border-r border-[#1E293B] bg-[#1E293B] transition-transform duration-300 md:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-[#334155] p-4">
              <h2 className="font-orbitron text-lg font-bold text-white">COMMAND CENTER</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {viewMode === "list" && (
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="mb-4 w-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>ADD COMPANY</span>
                </Button>
              )}

              {viewMode === "details" && (
                <Button
                  onClick={handleBackToCompanyList}
                  className="mb-4 w-full bg-[#334155] hover:bg-[#475569]"
                  variant="outline"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  <span>BACK</span>
                </Button>
              )}

              {/* Company list in sidebar for mobile */}
              {!isLoading && viewMode === "list" && companies.length > 0 && (
                <div className="space-y-2">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => handleCompanySelect(company)}
                      className="w-full rounded-md border border-[#334155] bg-[#1E293B] p-3 text-left transition-all hover:border-[#6366F1] hover:bg-[#334155]"
                    >
                      <div className="flex items-center">
                        <Building2 className="mr-3 h-5 w-5 text-[#6366F1]" />
                        <div className="overflow-hidden">
                          <p className="truncate font-medium text-white">{company.name}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-[#0F172A] p-4 md:p-6">
          {viewMode === "list" ? (
            <>
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <h2 className="font-orbitron text-2xl font-bold text-white">COMPANIES</h2>
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED] md:hidden"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>ADD COMPANY</span>
                </Button>
              </div>
              <CompanyList companies={companies} isLoading={isLoading} onSelect={handleCompanySelect} />
            </>
          ) : (
            selectedCompany && (
              <>
                <div className="mb-6 flex items-center md:hidden">
                  <Button
                    onClick={handleBackToCompanyList}
                    variant="outline"
                    className="mr-4 bg-[#334155] hover:bg-[#475569]"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    <span>BACK</span>
                  </Button>
                  <h2 className="font-orbitron text-xl font-bold text-white">{selectedCompany.name}</h2>
                </div>
                <CompanyDetails
                  company={selectedCompany}
                  onBack={handleBackToCompanyList}
                  onUpdate={handleCompanyUpdate}
                />
              </>
            )
          )}
        </main>
      </div>

      {/* Add Company Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="border-[#334155] bg-[#1E293B] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron text-xl text-white">ADD NEW COMPANY</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">Create a new company in the system.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCompany} className="space-y-4">
            {formError && (
              <Alert variant="destructive" className="border-red-500 bg-red-900/20 text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="ml-2">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#94A3B8]">
                Company Name
              </Label>
              <Input
                id="name"
                name="name"
                required
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#94A3B8]">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-[#94A3B8]">
                Phone
              </Label>
              <Input
                id="phone"
                name="phone"
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="text-[#94A3B8]">
                Address
              </Label>
              <Input
                id="address"
                name="address"
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-[#94A3B8]">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url" className="text-[#94A3B8]">
                Logo URL
              </Label>
              <Input
                id="logo_url"
                name="logo_url"
                placeholder="/images/company-logo.png"
                className="border-[#334155] bg-[#0F172A] text-white focus:border-[#6366F1]"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="border-[#334155] bg-transparent text-[#94A3B8] hover:bg-[#334155] hover:text-white"
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> CREATING...
                  </>
                ) : (
                  "CREATE COMPANY"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
