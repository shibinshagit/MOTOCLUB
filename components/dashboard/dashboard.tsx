import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Plus,
  Receipt,
  Package,
  User,
  AlertTriangle,
  Truck,
  ArrowRightLeft,
  Landmark,
  Power,
  Menu,
  X,
  ChevronUp,
  ChevronDown,
  UserCircle2,
  LogOut,
  Store,
  Flame,
  Database,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { logout } from "@/app/actions/auth-actions"
import { FormAlert } from "@/components/ui/form-alert"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import SaleTab from "./sale-tab"
import PurchaseTab from "./purchase-tab"
import InventoryDrawer from "@/components/products/inventory-drawer"
import TrendingDrawer from "@/components/products/trending-drawer"
import CustomerTab from "./customer-tab"
import TransferTab from "./transfer-tab"
import AccountingTab from "./accounting-tab"
import SupplierTab from "./supplier-tab"
import PlatformTab from "./platform-tab"
import MasterDataTab from "./master-data-tab"
import StaffAuthModal from "../staff/staff-auth-modal"
import { BrandLogo } from "@/components/brand-logo"

import { useAppSelector, useAppDispatch } from "@/store/hooks"
import {
  selectUser,
  selectCompany,
  selectDevice,
  selectDeviceLogo,
  clearDeviceData,
  updateDeviceProfile,
} from "@/store/slices/deviceSlice"
import { getDeviceProfile } from "@/app/actions/auth-actions"
import { activateStaff, clearStaff, selectActiveStaff, setStaff } from "@/store/slices/staffSlice"
import { getStaffForAuthentication } from "@/app/actions/staff-actions"

type TabType = "sale" | "sales" | "purchase" | "product" | "trending" | "customer" | "transfer" | "accounting" | "supplier" | "platform" | "master"

const DEFAULT_CONTENT_TAB: TabType = "sale"

interface DashboardProps {
  onLogout?: () => void
}

// Fallback component for when a tab fails to load
function ErrorTab({ name }: { name: string }) {
  return (
    <FormAlert
      type="error"
      title={`Error Loading ${name} Tab`}
      message="There was an error loading this tab. Please try again later."
      className="mb-6"
    />
  )
}

// Loading component
function LoadingTab() {
  return (
    <div className="flex justify-center items-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
    </div>
  )
}

export function Dashboard({ onLogout }: DashboardProps) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as TabType | "home" | null
  const resolveTab = (param: TabType | "stock" | "home" | null): TabType => {
    if (param === "stock") return "product"
    if (param === "sales") return "sale"
    if (param === "home") return "trending"
    if (
      param &&
      ["sale", "purchase", "product", "trending", "customer", "transfer", "accounting", "supplier", "platform", "master"].includes(
        param,
      )
    ) {
      return param
    }
    return "trending"
  }
  const initialTab = resolveTab(tabParam)

  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [lastContentTab, setLastContentTab] = useState<TabType>(
    initialTab === "product" || initialTab === "trending" ? DEFAULT_CONTENT_TAB : initialTab,
  )
  const activeTabRef = useRef(activeTab)
  const lastContentTabRef = useRef(lastContentTab)
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectUser)
  const company = useAppSelector(selectCompany)
  const device = useAppSelector(selectDevice)
  const deviceLogo = useAppSelector(selectDeviceLogo)
  const activeStaff = useAppSelector(selectActiveStaff)

  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isFooterExpanded, setIsFooterExpanded] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [staffAuthOpen, setStaffAuthOpen] = useState(false)
  const [isRestoringStaffSession, setIsRestoringStaffSession] = useState(false)
  
  const router = useRouter()
  const { toast } = useToast()
  const getStaffSessionKey = useCallback((deviceId?: number | null) => {
    return deviceId ? `staff_session_device_${deviceId}` : ""
  }, [])

  // Refs for stable references
  const routerRef = useRef(router)
  const dispatchRef = useRef(dispatch)
  
  // Update refs when values change
  useEffect(() => {
    routerRef.current = router
    dispatchRef.current = dispatch
  })

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    lastContentTabRef.current = lastContentTab
  }, [lastContentTab])

  // Mount effect - runs once
  useEffect(() => {
    setMounted(true)
  }, [])

  // Refresh device logo/profile from DB (handles stale localStorage and admin logo updates)
  useEffect(() => {
    if (!mounted || !device?.id) return

    let cancelled = false

    getDeviceProfile(device.id).then((result) => {
      if (cancelled || !result.success || !result.data) return

      dispatchRef.current(
        updateDeviceProfile({
          name: result.data.name,
          currency: result.data.currency,
          logo_url: result.data.logo_url,
          company: result.data.company,
        }),
      )
    })

    return () => {
      cancelled = true
    }
  }, [mounted, device?.id])

  // Authentication effect - with stabilized dependencies
  useEffect(() => {
    if (mounted && !user?.id) {
      routerRef.current.push("/")
      return
    }
    if (mounted && user?.id) {
      setIsLoading(false)
    }
  }, [mounted, user?.id])

  useEffect(() => {
    const restoreStaffSession = async () => {
      if (!mounted || !user?.id || !device?.id || activeStaff || isRestoringStaffSession) return

      setIsRestoringStaffSession(true)
      try {
        const sessionKey = getStaffSessionKey(device.id)
        const storedStaffIdRaw = typeof window !== "undefined" ? localStorage.getItem(sessionKey) : null
        const storedStaffId = storedStaffIdRaw ? Number.parseInt(storedStaffIdRaw, 10) : NaN

        if (!storedStaffId || Number.isNaN(storedStaffId)) {
          setStaffAuthOpen(true)
          return
        }

        const staffRes = await getStaffForAuthentication(device.id)
        if (!staffRes.success || !staffRes.data?.length) {
          setStaffAuthOpen(true)
          return
        }

        const staffList = staffRes.data as any[]
        const matchedStaff = staffList.find((member) => member.id === storedStaffId)
        if (!matchedStaff) {
          localStorage.removeItem(sessionKey)
          setStaffAuthOpen(true)
          return
        }

        dispatchRef.current(setStaff(staffList))
        dispatchRef.current(
          activateStaff({
            staffId: storedStaffId,
            allStaff: staffList,
          }),
        )
        setStaffAuthOpen(false)
      } catch {
        setStaffAuthOpen(true)
      } finally {
        setIsRestoringStaffSession(false)
      }
    }

    restoreStaffSession()
  }, [mounted, user?.id, device?.id, activeStaff, isRestoringStaffSession, getStaffSessionKey])

  // Tab parameter synchronization
  useEffect(() => {
    const tab = resolveTab(tabParam)
    if (tab === "product" || tab === "trending") {
      setActiveTab(tab)
      return
    }
    setLastContentTab(tab)
    setActiveTab(tab)
  }, [tabParam])

  const salesViewParam = searchParams.get("salesView")
  const salesNavView = salesViewParam === "entry" ? "entry" : "list"
  const isOnSaleTab = activeTab === "sale" || activeTab === "sales"

  const purchaseViewParam = searchParams.get("purchaseView")
  const purchaseNavView = purchaseViewParam === "entry" ? "entry" : "list"
  const isOnPurchaseTab = activeTab === "purchase"

  const handlePurchaseViewSelect = useCallback((view: "list" | "entry") => {
    setIsAddModalOpen(false)
    setIsMobileMenuOpen(false)
    setIsFooterExpanded(false)
    setLastContentTab("purchase")
    setActiveTab("purchase")

    const url = new URL(window.location.href)
    url.searchParams.set("tab", "purchase")
    url.searchParams.set("purchaseView", view)
    if (view === "list") {
      url.searchParams.delete("editPurchaseId")
    }
    routerRef.current.replace(url.pathname + url.search)
  }, [])

  const handleSalesViewSelect = useCallback((view: "list" | "entry") => {
    setIsAddModalOpen(false)
    setIsMobileMenuOpen(false)
    setIsFooterExpanded(false)
    setLastContentTab("sale")
    setActiveTab("sale")

    const url = new URL(window.location.href)
    url.searchParams.set("tab", "sale")
    url.searchParams.set("salesView", view)
    if (view === "list") {
      url.searchParams.delete("editSaleId")
    }
    routerRef.current.replace(url.pathname + url.search)
  }, [])

  useEffect(() => {
    if (tabParam !== "sales") return
    const url = new URL(window.location.href)
    url.searchParams.set("tab", "sale")
    url.searchParams.set("salesView", "list")
    routerRef.current.replace(url.pathname + url.search)
  }, [tabParam])

  // Handle tab change with URL update
  const handleTabChange = useCallback(
    (tab: TabType) => {
      if (tab === "product" || tab === "trending") {
        if (activeTabRef.current !== "product" && activeTabRef.current !== "trending") {
          setLastContentTab(activeTabRef.current)
        }
      } else {
        setLastContentTab(tab)
      }
      setActiveTab(tab)
      setIsAddModalOpen(false)
      setIsMobileMenuOpen(false)
      setIsFooterExpanded(false)

      // Update URL without full page reload
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      if (tab === "sale") {
        if (!url.searchParams.get("salesView")) {
          url.searchParams.set("salesView", "list")
        }
      } else if (tab !== "product" && tab !== "trending") {
        url.searchParams.delete("salesView")
      }
      if (tab === "purchase") {
        if (!url.searchParams.get("purchaseView")) {
          url.searchParams.set("purchaseView", "list")
        }
      } else if (tab !== "product" && tab !== "trending") {
        url.searchParams.delete("purchaseView")
      }
      if (tab !== "product" && tab !== "trending") {
        url.searchParams.delete("editSaleId")
        url.searchParams.delete("editPurchaseId")
      }
      routerRef.current.replace(url.pathname + url.search)
    },
    [],
  )

  const handleInventoryToggle = useCallback(() => {
    if (activeTabRef.current === "product") {
      handleTabChange(lastContentTabRef.current)
      return
    }
    handleTabChange("product")
  }, [handleTabChange])

  const handleLogout = useCallback(async () => {
    try {
      // Clear Redux store first
      if (device?.id && typeof window !== "undefined") {
        localStorage.removeItem(getStaffSessionKey(device.id))
      }
      dispatchRef.current(clearDeviceData())
      dispatchRef.current(clearStaff())

      await logout()

      if (onLogout) {
        onLogout()
      } else {
        routerRef.current.push("/")
      }
    } catch (error) {
      notifyError(toast, "Failed to log out")

      // Even if server logout fails, clear Redux and redirect
      if (device?.id && typeof window !== "undefined") {
        localStorage.removeItem(getStaffSessionKey(device.id))
      }
      dispatchRef.current(clearDeviceData())
      dispatchRef.current(clearStaff())
      routerRef.current.push("/")
    }
  }, [onLogout, toast, device?.id, getStaffSessionKey])

  const handleStaffLogout = useCallback(() => {
    if (device?.id && typeof window !== "undefined") {
      localStorage.removeItem(getStaffSessionKey(device.id))
    }
    dispatchRef.current(clearStaff())
    setStaffAuthOpen(true)
    setIsMobileMenuOpen(false)
    notifySuccess(toast, "Please log in with staff password to continue.", "Staff logged out")
  }, [toast, device?.id, getStaffSessionKey])

  // Don't render anything until mounted (prevents hydration issues)
  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Render the appropriate tab content with error handling
  const renderTabContent = () => {
    try {
      const deviceId = device?.id
      const companyId = company?.id || 1
      const contentTab = activeTab === "product" || activeTab === "trending" ? lastContentTab : activeTab

      switch (contentTab) {
        case "sale":
        case "sales":
          return (
            <SaleTab
              userId={user?.id}
              isAddModalOpen={activeTab === "sale" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
              mode={salesNavView === "entry" ? "entry" : "info"}
            />
          )
        case "purchase":
          return (
            <PurchaseTab
              userId={user?.id || 0}
              mode={purchaseNavView === "entry" ? "entry" : "info"}
            />
          )
        case "customer":
          return (
            <CustomerTab
              userId={user?.id}
              isAddModalOpen={activeTab === "customer" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
            />
          )
        case "supplier":
          return (
            <SupplierTab
              userId={user?.id}
              isAddModalOpen={activeTab === "supplier" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
            />
          )
        case "transfer":
          return <TransferTab userId={user?.id || 0} />
        case "accounting":
          return <AccountingTab userId={user?.id || 0} companyId={companyId} deviceId={deviceId || 0} />
        case "platform":
          return <PlatformTab userId={user?.id || 0} />
        case "master":
          return <MasterDataTab userId={user?.id || 0} />
        default:
          return <ErrorTab name={activeTab} />
      }
    } catch (error) {
      console.error(`Error rendering ${activeTab} tab:`, error)
      return <ErrorTab name={activeTab} />
    }
  }

  // Navigation items configuration
 const navItems = [
    { id: "trending", icon: <Flame className="h-4 w-4" />, label: "Trending" },
    { id: "purchase", icon: <Receipt className="h-4 w-4" />, label: "Purchase" },
    { id: "sale", icon: <Plus className="h-5 w-5" />, label: "Sales" },
    { id: "customer", icon: <User className="h-4 w-4" />, label: "Customers" },
    { id: "supplier", icon: <Truck className="h-4 w-4" />, label: "Suppliers" },
    { id: "transfer", icon: <ArrowRightLeft className="h-4 w-4" />, label: "Transfers" },
    { id: "platform", icon: <Store className="h-4 w-4" />, label: "Platforms" },
    { id: "master", icon: <Database className="h-4 w-4" />, label: "Master Data" },
  ]

  // Primary tabs for bottom navigation (most used)
  const primaryTabs = ["trending", "sale", "purchase"]
  const secondaryTabs = ["customer", "supplier", "transfer", "platform", "master"]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {dbError && (
        <div className="mb-4 p-4 border border-red-300 bg-red-50 rounded-md">
          <p className="text-red-700 flex items-center">
            <span className="mr-2">⚠️</span>
            <span>Database error: {dbError}</span>
          </p>
        </div>
      )}
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center flex-1 min-w-0">
          <div className="relative mr-3 h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
            {deviceLogo ? (
              <Image
                src={deviceLogo}
                alt={`${device?.name || "Device"} logo`}
                fill
                className="object-contain"
                priority
                unoptimized={deviceLogo.includes("blob.vercel-storage.com")}
              />
            ) : (
              <BrandLogo variant="icon" width={40} height={40} className="h-full w-full" priority />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-lg sm:text-xl font-bold text-gray-800 truncate">
              {company?.name || "Company"}
            </span>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse flex-shrink-0"></div>
              <span className="text-xs text-gray-500 truncate">
                {device?.name || "Device"} - {device?.currency || "AED"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
          {/* Mobile Menu Button */}
          <Button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            variant="ghost"
            size="sm"
            className="sm:hidden flex items-center gap-2"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>

          {/* Desktop Controls */}
          <div className="hidden sm:flex items-center space-x-2">
            <Button
              onClick={handleInventoryToggle}
              variant="ghost"
              size="sm"
              className={cn(
                "h-9 w-9 rounded-full p-0 hover:bg-violet-50 text-violet-700 hover:text-violet-800",
                activeTab === "product" && "bg-violet-100",
              )}
              title="Inventory"
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => handleTabChange("accounting")}
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0 hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800"
              title="Accounting"
            >
              <Landmark className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0 hover:bg-red-50 text-red-600 hover:text-red-700"
              title="Logout"
            >
              <Power className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full p-0 hover:bg-gray-100"
                  title="Staff Profile"
                >
                  <UserCircle2 className="h-4 w-4 text-gray-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white border-gray-200"
              >
                <DropdownMenuLabel className="text-gray-900">Staff Profile</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-200" />
                {activeStaff ? (
                  <>
                    <div className="px-2 py-2">
                      <p className="text-sm font-medium text-gray-900">{activeStaff.name}</p>
                      <p className="text-xs text-gray-500">
                        {activeStaff.role === "admin" ? "Admin role" : "Normal staff role"}
                      </p>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-200" />
                    <DropdownMenuItem
                      onClick={handleStaffLogout}
                      className="cursor-pointer text-amber-700 hover:bg-amber-50"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Staff Logout
                    </DropdownMenuItem>
                  </>
                ) : (
                  <div className="px-2 py-2 text-sm text-amber-600">No staff authenticated</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Controls */}
          <div className="flex sm:hidden items-center space-x-2">
            <Button
              onClick={handleInventoryToggle}
              variant="ghost"
              size="sm"
              className={cn(
                "h-9 w-9 rounded-full p-0 hover:bg-violet-50 text-violet-700",
                activeTab === "product" && "bg-violet-100",
              )}
              title="Inventory"
            >
              <Package className="h-5 w-5" />
            </Button>
            <Button
              onClick={() => handleTabChange("accounting")}
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0 hover:bg-emerald-50 text-emerald-700"
              title="Accounting"
            >
              <Landmark className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full p-0 hover:bg-gray-100"
                  title="Staff Profile"
                >
                  <UserCircle2 className="h-5 w-5 text-gray-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white border-gray-200"
              >
                <DropdownMenuLabel className="text-gray-900">Staff Profile</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-200" />
                {activeStaff ? (
                  <>
                    <div className="px-2 py-2">
                      <p className="text-sm font-medium text-gray-900">{activeStaff.name}</p>
                      <p className="text-xs text-gray-500">
                        {activeStaff.role === "admin" ? "Admin role" : "Normal staff role"}
                      </p>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-200" />
                    <DropdownMenuItem
                      onClick={handleStaffLogout}
                      className="cursor-pointer text-amber-700 hover:bg-amber-50"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Staff Logout
                    </DropdownMenuItem>
                  </>
                ) : (
                  <div className="px-2 py-2 text-sm text-amber-600">No staff authenticated</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="flex items-center hover:bg-red-50 text-red-600"
              title="Logout"
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      {isMobileMenuOpen && (
        <div className="z-20 border-b border-border bg-card sm:hidden">
          <div className="space-y-3 px-4 py-3">
            <div className="border-t border-border pt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Account
              </p>
              <div className="space-y-2">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-xs text-gray-600">
                    {activeStaff ? (
                      <>
                        Staff: <span className="font-semibold">{activeStaff.name}</span>
                      </>
                    ) : (
                      "Staff not authenticated"
                    )}
                  </p>
                  {activeStaff ? (
                    <Button
                      onClick={handleStaffLogout}
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      Staff Logout
                    </Button>
                  ) : null}
                </div>
              </div>
            </div> 
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-6 pb-4 sm:pb-20">
        {dbError && (
          <FormAlert
            type="error"
            title="Database Connection Error"
            message={`${dbError} Some features may be limited.`}
            className="mb-6"
          />
        )}

        <div className="pb-4 mb-20 sm:mb-0">{renderTabContent()}</div>
      </main>

      {/* Bottom Navigation - Mobile */}
      <div className="sm:hidden">
        <div className="fixed inset-x-0 bottom-0 z-50">
          {/* Secondary tabs drawer */}
          <div className={`border-t border-border bg-card transition-all duration-300 ease-in-out ${
            isFooterExpanded 
              ? 'translate-y-0 opacity-100' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}>
            <div className="safe-area-inset-bottom grid h-14 grid-cols-5 border-b border-border">
              {secondaryTabs.map((tabId) => {
                const item = navItems.find(nav => nav.id === tabId)
                if (!item) return null
                
                return (
                  <MobileNavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    iconOnly={Boolean((item as any).iconOnly)}
                    isActive={activeTab === item.id}
                    onClick={() => handleTabChange(item.id as TabType)}
                  />
                )
              })}
            </div>
          </div>

          {/* Primary tabs */}
          <div className="border-t border-border bg-card pb-safe">
            <div className="grid grid-cols-4 h-16">
              {primaryTabs.map((tabId) => {
                if (tabId === "purchase") {
                  return (
                    <PurchaseNavSegment
                      key="purchase"
                      activeView={purchaseNavView}
                      isOnPurchaseTab={isOnPurchaseTab}
                      onSelect={handlePurchaseViewSelect}
                      compact
                    />
                  )
                }

                if (tabId === "sale") {
                  return (
                    <SalesNavSegment
                      key="sale"
                      activeView={salesNavView}
                      isOnSaleTab={isOnSaleTab}
                      onSelect={handleSalesViewSelect}
                      compact
                    />
                  )
                }

                const item = navItems.find(nav => nav.id === tabId)
                if (!item) return null
                
                return (
                  <MobileNavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    iconOnly={Boolean((item as any).iconOnly)}
                    isActive={activeTab === item.id}
                    onClick={() => handleTabChange(item.id as TabType)}
                  />
                )
              })}
              
              <button
                onClick={() => setIsFooterExpanded(!isFooterExpanded)}
                className={`flex flex-col items-center justify-center h-16 transition-all duration-200 ${
                  isFooterExpanded 
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-500"
                }`}
              >
                <div className="mb-1">
                  {isFooterExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </div>
                <span className="text-xs font-medium leading-none">
                  {isFooterExpanded ? "Less" : "More"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden sm:block sticky bottom-0">
        <div className="flex h-16 items-center justify-around border-t border-border bg-card">
          {navItems.map((item) => {
            if (item.id === "purchase") {
              return (
                <PurchaseNavSegment
                  key={item.id}
                  activeView={purchaseNavView}
                  isOnPurchaseTab={isOnPurchaseTab}
                  onSelect={handlePurchaseViewSelect}
                />
              )
            }

            if (item.id === "sale") {
              return (
                <SalesNavSegment
                  key={item.id}
                  activeView={salesNavView}
                  isOnSaleTab={isOnSaleTab}
                  onSelect={handleSalesViewSelect}
                />
              )
            }

            return (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                iconOnly={Boolean((item as any).iconOnly)}
                isActive={activeTab === item.id}
                onClick={() => handleTabChange(item.id as TabType)}
              />
            )
          })}
        </div>
      </nav>

      <InventoryDrawer
        open={activeTab === "product"}
        onOpenChange={(open) => {
          if (!open) handleTabChange(lastContentTabRef.current)
        }}
        userId={user?.id || 0}
        isAddModalOpen={activeTab === "product" && isAddModalOpen}
        onModalClose={() => setIsAddModalOpen(false)}
      />

      <TrendingDrawer
        open={activeTab === "trending"}
        onOpenChange={(open) => {
          if (!open) handleTabChange(lastContentTabRef.current)
        }}
        userId={user?.id || 0}
      />

      {device?.id ? (
        <StaffAuthModal
          deviceId={device.id}
          isOpen={staffAuthOpen}
          onAuthenticated={(staffId) => {
            localStorage.setItem(getStaffSessionKey(device.id), String(staffId))
            setStaffAuthOpen(false)
          }}
          onLogout={handleLogout}
        />
      ) : null}
    </div>
  )
}

// Memoized navigation components for better performance
interface SalesNavSegmentProps {
  activeView: "list" | "entry"
  isOnSaleTab: boolean
  onSelect: (view: "list" | "entry") => void
  compact?: boolean
}

const SalesNavSegment = React.memo(function SalesNavSegment({
  activeView,
  isOnSaleTab,
  onSelect,
  compact = false,
}: SalesNavSegmentProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center",
        compact ? "px-0.5 py-1" : "px-1 py-2",
      )}
      role="tablist"
      aria-label="Sales views"
    >
      <div
        className={cn(
          "inline-flex w-full rounded-lg border border-slate-200 bg-[#F1F4F9] shadow-sm",
          compact ? "max-w-none p-0.5" : "max-w-[148px] p-1",
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={isOnSaleTab && activeView === "list"}
          onClick={() => onSelect("list")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-md font-medium transition-all duration-200",
            compact ? "px-1 py-1 text-[9px]" : "px-2 py-1.5 text-[10px] sm:text-xs",
            isOnSaleTab && activeView === "list"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-muted-foreground hover:text-slate-900",
          )}
        >
          <Receipt className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          <span className="mt-0.5 leading-none">Sales</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isOnSaleTab && activeView === "entry"}
          aria-label="New sale"
          title="New sale"
          onClick={() => onSelect("entry")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-md font-medium transition-all duration-200",
            compact ? "px-1 py-1" : "px-2 py-1.5",
            isOnSaleTab && activeView === "entry"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-muted-foreground hover:text-slate-900",
          )}
        >
          <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  )
})

interface PurchaseNavSegmentProps {
  activeView: "list" | "entry"
  isOnPurchaseTab: boolean
  onSelect: (view: "list" | "entry") => void
  compact?: boolean
}

const PurchaseNavSegment = React.memo(function PurchaseNavSegment({
  activeView,
  isOnPurchaseTab,
  onSelect,
  compact = false,
}: PurchaseNavSegmentProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center",
        compact ? "px-0.5 py-1" : "px-1 py-2",
      )}
      role="tablist"
      aria-label="Purchase views"
    >
      <div
        className={cn(
          "inline-flex w-full rounded-lg border border-slate-200 bg-[#F1F4F9] shadow-sm",
          compact ? "max-w-none p-0.5" : "max-w-[148px] p-1",
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={isOnPurchaseTab && activeView === "list"}
          onClick={() => onSelect("list")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-md font-medium transition-all duration-200",
            compact ? "px-1 py-1 text-[9px]" : "px-2 py-1.5 text-[10px] sm:text-xs",
            isOnPurchaseTab && activeView === "list"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-muted-foreground hover:text-slate-900",
          )}
        >
          <Receipt className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          <span className="mt-0.5 leading-none">Purchases</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isOnPurchaseTab && activeView === "entry"}
          aria-label="New purchase"
          title="New purchase"
          onClick={() => onSelect("entry")}
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-md font-medium transition-all duration-200",
            compact ? "px-1 py-1" : "px-2 py-1.5",
            isOnPurchaseTab && activeView === "entry"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-muted-foreground hover:text-slate-900",
          )}
        >
          <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  )
})

interface NavItemProps {
  icon: React.ReactNode
  label: string
  iconOnly?: boolean
  isActive: boolean
  onClick: () => void
}

const NavItem = React.memo(function NavItem({ icon, label, iconOnly = false, isActive, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex flex-1 flex-col items-center justify-center transition-all duration-200 py-2 ${
        isActive ? "text-violet-700" : "text-muted-foreground"
      }`}
      onClick={onClick}
    >
      <div
        className={
          iconOnly
            ? `flex h-10 w-10 items-center justify-center rounded-full border shadow-sm ${
                isActive
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-border bg-card"
              }`
            : "mb-1"
        }
      >
        {icon}
      </div>
      {!iconOnly ? <span className="text-xs font-medium leading-tight">{label}</span> : null}
    </button>
  )
})

const MobileNavItem = React.memo(function MobileNavItem({ icon, label, iconOnly = false, isActive, onClick }: NavItemProps) {
  return (
    <button
      className={`flex flex-col items-center justify-center h-full transition-all duration-200 ${
        isActive ? "bg-violet-50 text-violet-700" : "text-muted-foreground"
      }`}
      onClick={onClick}
    >
      <div
        className={
          iconOnly
            ? `flex h-10 w-10 items-center justify-center rounded-full border shadow-sm ${
                isActive
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-border bg-card"
              }`
            : "mb-1"
        }
      >
        {icon}
      </div>
      {!iconOnly ? <span className="text-xs font-medium leading-none truncate max-w-full px-0.5">{label}</span> : null}
    </button>
  )
})

export default Dashboard
