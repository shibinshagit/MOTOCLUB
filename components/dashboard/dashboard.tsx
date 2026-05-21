import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Home,
  ShoppingCart,
  Receipt,
  Package,
  User,
  AlertTriangle,
  Truck,
  ArrowRightLeft,
  Calculator,
  Power,
  Menu,
  X,
  ChevronUp,
  ChevronDown,
  UserCircle2,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { logout } from "@/app/actions/auth-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import HomeTab from "./home-tab"
import SaleTab from "./sale-tab"
import PurchaseTab from "./purchase-tab"
import ProductTab from "./product-tab"
import CustomerTab from "./customer-tab"
import TransferTab from "./transfer-tab"
import AccountingTab from "./accounting-tab"
import SupplierTab from "./supplier-tab"
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle"
import StaffAuthModal from "../staff/staff-auth-modal"

import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { selectUser, selectCompany, selectDevice, clearDeviceData } from "@/store/slices/deviceSlice"
import { clearStaff, selectActiveStaff } from "@/store/slices/staffSlice"

type TabType = "home" | "sale" | "purchase" | "product" | "customer" | "transfer" | "accounting" | "supplier"

interface DashboardProps {
  mockMode?: boolean
}

// Fallback component for when a tab fails to load
function ErrorTab({ name }: { name: string }) {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Error Loading {name} Tab</AlertTitle>
      <AlertDescription>There was an error loading this tab. Please try again later.</AlertDescription>
    </Alert>
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

export function Dashboard({ mockMode = false }: DashboardProps) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as TabType | null

  const [activeTab, setActiveTab] = useState<TabType>(tabParam || "home")
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectUser)
  const company = useAppSelector(selectCompany)
  const device = useAppSelector(selectDevice)
  const activeStaff = useAppSelector(selectActiveStaff)

  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isFooterExpanded, setIsFooterExpanded] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [staffAuthOpen, setStaffAuthOpen] = useState(false)
  
  const router = useRouter()
  const { toast } = useToast()

  // Refs for stable references
  const routerRef = useRef(router)
  const dispatchRef = useRef(dispatch)
  
  // Update refs when values change
  useEffect(() => {
    routerRef.current = router
    dispatchRef.current = dispatch
  })

  // Mount effect - runs once
  useEffect(() => {
    setMounted(true)
  }, [])

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
    if (!mounted || !user?.id || !device?.id) return
    if (!activeStaff) {
      setStaffAuthOpen(true)
    }
  }, [mounted, user?.id, device?.id, activeStaff])

  // Tab parameter synchronization
  useEffect(() => {
    if (
      tabParam &&
      ["home", "sale", "purchase", "product", "customer", "transfer", "accounting", "supplier"].includes(
        tabParam,
      )
    ) {
      setActiveTab(tabParam)
    } else if (tabParam === "stock") {
      setActiveTab("product")
    }
  }, [tabParam])

  // Handle tab change with URL update
  const handleTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab)
      setIsAddModalOpen(false)
      setIsMobileMenuOpen(false)
      setIsFooterExpanded(false)

      // Update URL without full page reload
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      routerRef.current.replace(url.pathname + url.search)
    },
    [],
  )

  const handleLogout = useCallback(async () => {
    try {
      // Clear Redux store first
      dispatchRef.current(clearDeviceData())
      dispatchRef.current(clearStaff())

      if (!mockMode) {
        await logout()
      }

      // Redirect to home page
      routerRef.current.push("/")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      })

      // Even if server logout fails, clear Redux and redirect
      dispatchRef.current(clearDeviceData())
      dispatchRef.current(clearStaff())
      routerRef.current.push("/")
    }
  }, [mockMode, toast])

  const handleStaffLogout = useCallback(() => {
    dispatchRef.current(clearStaff())
    setStaffAuthOpen(true)
    setIsMobileMenuOpen(false)
    toast({
      title: "Staff logged out",
      description: "Please log in with staff password to continue.",
    })
  }, [toast])

  // Don't render anything until mounted (prevents hydration issues)
  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Render the appropriate tab content with error handling
  const renderTabContent = () => {
    try {
      const deviceId = device?.id
      const companyId = company?.id || 1

      switch (activeTab) {
        case "home":
          return <HomeTab userId={user?.id} deviceId={deviceId} />
        case "sale":
          return (
            <SaleTab
              userId={user?.id}
              isAddModalOpen={activeTab === "sale" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
            />
          )
        case "purchase":
          return (
            <PurchaseTab
              userId={user?.id}
              isAddModalOpen={activeTab === "purchase" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
            />
          )
        case "product":
          return (
            <ProductTab
              userId={user?.id}
              isAddModalOpen={activeTab === "product" && isAddModalOpen}
              onModalClose={() => setIsAddModalOpen(false)}
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
    { id: "home", icon: <Home className="h-4 w-4" />, label: "Home" },
    { id: "sale", icon: <ShoppingCart className="h-4 w-4" />, label: "Sale" },
    { id: "purchase", icon: <Receipt className="h-4 w-4" />, label: "Purchase" },
    { id: "product", icon: <Package className="h-4 w-4" />, label: "Inventory" },
    { id: "customer", icon: <User className="h-4 w-4" />, label: "Customers" },
    { id: "supplier", icon: <Truck className="h-4 w-4" />, label: "Suppliers" },
    { id: "transfer", icon: <ArrowRightLeft className="h-4 w-4" />, label: "Transfers" },
    { id: "accounting", icon: <Calculator className="h-4 w-4" />, label: "Accounting" },
  ]

  // Primary tabs for bottom navigation (most used)
  const primaryTabs = ["home", "sale", "purchase", "product"]
  const secondaryTabs = ["customer", "supplier", "transfer", "accounting"]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {dbError && (
        <div className="mb-4 p-4 border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-md">
          <p className="text-red-700 dark:text-red-400 flex items-center">
            <span className="mr-2">⚠️</span>
            <span>Database error: {dbError}</span>
          </p>
        </div>
      )}
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 shadow-sm">
        <div className="flex items-center flex-1 min-w-0">
          <div className="relative mr-3 h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
            {company?.logo_url ? (
              <Image
                src={company.logo_url || "/placeholder.svg"}
                alt="Company Logo"
                fill
                className="object-contain"
                priority
              />
            ) : (
              <Image src="/images/ap-logo.png" alt="Default Logo" fill className="object-contain" priority />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200 font-serif tracking-wide truncate">
              {company?.name || "AL ANEEQ"}
            </span>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse flex-shrink-0"></div>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              title="Logout"
            >
              <Power className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Staff Profile"
                >
                  <UserCircle2 className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">Staff Profile</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                <div className="px-2 py-2 flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-200">Theme</span>
                  <AnimatedThemeToggle />
                </div>
                <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                {activeStaff ? (
                  <>
                    <div className="px-2 py-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{activeStaff.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Active staff session</p>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                    <DropdownMenuItem
                      onClick={handleStaffLogout}
                      className="cursor-pointer text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Staff Logout
                    </DropdownMenuItem>
                  </>
                ) : (
                  <div className="px-2 py-2 text-sm text-amber-600 dark:text-amber-400">No staff authenticated</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Controls */}
          <div className="flex sm:hidden items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Staff Profile"
                >
                  <UserCircle2 className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">Staff Profile</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                <div className="px-2 py-2 flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-200">Theme</span>
                  <AnimatedThemeToggle />
                </div>
                <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                {activeStaff ? (
                  <>
                    <div className="px-2 py-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{activeStaff.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Active staff session</p>
                    </div>
                    <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                    <DropdownMenuItem
                      onClick={handleStaffLogout}
                      className="cursor-pointer text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Staff Logout
                    </DropdownMenuItem>
                  </>
                ) : (
                  <div className="px-2 py-2 text-sm text-amber-600 dark:text-amber-400">No staff authenticated</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="flex items-center hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              title="Logout"
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg z-20">
          <div className="px-4 py-3 space-y-3">
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Account
              </p>
              <div className="space-y-2">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <p className="text-xs text-gray-600 dark:text-gray-300">
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
                      className="mt-2 h-7 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
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
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>{dbError} Some features may be limited.</AlertDescription>
          </Alert>
        )}

        <div className="pb-4 mb-20 sm:mb-0">{renderTabContent()}</div>
      </main>

      {/* Bottom Navigation - Mobile */}
      <div className="sm:hidden">
        <div className="fixed inset-x-0 bottom-0 z-50">
          {/* Secondary tabs drawer */}
          <div className={`bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${
            isFooterExpanded 
              ? 'translate-y-0 opacity-100' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}>
            <div className="grid grid-cols-4 h-14 border-b border-gray-100 dark:border-gray-700 safe-area-inset-bottom">
              {secondaryTabs.map((tabId) => {
                const item = navItems.find(nav => nav.id === tabId)
                if (!item) return null
                
                return (
                  <MobileNavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeTab === item.id}
                    onClick={() => handleTabChange(item.id as TabType)}
                  />
                )
              })}
            </div>
          </div>

          {/* Primary tabs */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-safe">
            <div className="grid grid-cols-5 h-16">
              {primaryTabs.map((tabId) => {
                const item = navItems.find(nav => nav.id === tabId)
                if (!item) return null
                
                return (
                  <MobileNavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeTab === item.id}
                    onClick={() => handleTabChange(item.id as TabType)}
                  />
                )
              })}
              
              <button
                onClick={() => setIsFooterExpanded(!isFooterExpanded)}
                className={`flex flex-col items-center justify-center h-16 transition-all duration-200 ${
                  isFooterExpanded 
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" 
                    : "text-gray-500 dark:text-gray-400"
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
        <div className="flex h-16 items-center justify-around bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activeTab === item.id}
              onClick={() => handleTabChange(item.id as TabType)}
            />
          ))}
        </div>
      </nav>

      {device?.id ? (
        <StaffAuthModal
          deviceId={device.id}
          isOpen={staffAuthOpen}
          onAuthenticated={() => setStaffAuthOpen(false)}
        />
      ) : null}
    </div>
  )
}

// Memoized navigation components for better performance
interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}

const NavItem = React.memo(function NavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      className={`flex flex-1 flex-col items-center justify-center transition-all duration-200 py-2 ${
        isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
      }`}
      onClick={onClick}
    >
      <div className="mb-1">{icon}</div>
      <span className="text-xs font-medium leading-tight">{label}</span>
    </button>
  )
})

const MobileNavItem = React.memo(function MobileNavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      className={`flex flex-col items-center justify-center h-full transition-all duration-200 ${
        isActive ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-gray-500 dark:text-gray-400"
      }`}
      onClick={onClick}
    >
      <div className="mb-1">{icon}</div>
      <span className="text-xs font-medium leading-none truncate max-w-full px-0.5">{label}</span>
    </button>
  )
})

export default Dashboard
