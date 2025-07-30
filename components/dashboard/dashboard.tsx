"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  Home,
  ShoppingCart,
  Receipt,
  Package,
  User,
  AlertTriangle,
  BarChart2,
  Truck,
  Calculator,
  Plus,
  Power,
  Menu,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { logout } from "@/app/actions/auth-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import HomeTab from "./home-tab"
import SaleTab from "./sale-tab"
import PurchaseTab from "./purchase-tab"
import ProductTab from "./product-tab"
import CustomerTab from "./customer-tab"
import StockTab from "./stock-tab"
import AccountingTab from "./accounting-tab"
import NewSaleTab from "./new-sale-tab"
import SupplierTab from "./supplier-tab"
import NewSaleModal from "@/components/sales/new-sale-modal"
import StaffHeaderDropdown from "./staff-header-dropdown"
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle"
import { useTheme } from "next-themes"

import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { selectUser, selectCompany, selectDevice, clearDeviceData } from "@/store/slices/deviceSlice"

type TabType = "home" | "sale" | "purchase" | "product" | "customer" | "stock" | "accounting" | "newsale" | "supplier"

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
  const [isLoading, setIsLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isHeaderSaleModalOpen, setIsHeaderSaleModalOpen] = useState(false)
  const [isFooterExpanded, setIsFooterExpanded] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
    // Force set theme to light on first mount if it's not set
    if (!theme || theme === "system") {
      console.log("Setting initial theme to light")
      setTheme("light")
    }
  }, [theme, setTheme])

  // Update active tab when URL changes
  useEffect(() => {
    if (
      tabParam &&
      ["home", "sale", "purchase", "product", "customer", "stock", "accounting", "newsale", "supplier"].includes(
        tabParam,
      )
    ) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  // Handle tab change with URL update
  const handleTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab)
      setIsAddModalOpen(false) // Reset modal state when changing tabs
      setIsMobileMenuOpen(false) // Close mobile menu when changing tabs
      setIsFooterExpanded(false) // Close footer expansion when changing tabs

      // Update URL without full page reload
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      router.replace(url.pathname + url.search)
    },
    [router],
  )

  useEffect(() => {
    // If no user in Redux, redirect to login
    if (!user?.id) {
      router.push("/")
      return
    }
    setIsLoading(false)
  }, [user, router])

  const handleLogout = async () => {
    try {
      // Clear Redux store
      dispatch(clearDeviceData())

      if (!mockMode) {
        await logout()
      }

      // Redirect to home page
      router.push("/")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      })

      // Even if server logout fails, clear Redux and redirect
      dispatch(clearDeviceData())
      router.push("/")
    }
  }

  const handleAddButtonClick = (tab?: TabType) => {
    if (tab === "sale") {
      // For sales, navigate to the new sale tab instead of opening a modal
      handleTabChange("newsale")
      return
    }

    setIsAddModalOpen(true)
    // If a specific tab is passed, switch to that tab first
    if (tab && tab !== activeTab) {
      handleTabChange(tab)
    }
    // Otherwise just open the modal for the current tab
  }

  // Handle header sale button click
  const handleHeaderSaleClick = () => {
    setIsHeaderSaleModalOpen(true)
  }

  // Handle header sale modal close
  const handleHeaderSaleModalClose = () => {
    setIsHeaderSaleModalOpen(false)
    // Refresh sales data if we're on the sales tab
    if (activeTab === "sale") {
      // Force refresh the sales tab
      window.location.reload()
    }
  }

  // Handle theme toggle - Simplified approach
  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark"
    console.log("All theme values:", { theme, resolvedTheme, systemTheme })
    console.log("Switching from", theme, "to", newTheme)

    setTheme(newTheme)

    // Force update after a short delay to ensure the change takes effect
    setTimeout(() => {
      console.log("Theme after change:", { theme, resolvedTheme, systemTheme })
    }, 100)
  }

  // Get the current theme for display purposes - simplified
  const currentTheme = theme === "light" ? "light" : "dark"

  if (isLoading) {
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
      const deviceId = device.id
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
        case "stock":
          return <StockTab userId={user?.id} />
        case "accounting":
          return <AccountingTab userId={user?.id || 0} companyId={companyId} deviceId={deviceId || 0} />
        case "newsale":
          return <NewSaleTab userId={user?.id} />
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
    { id: "product", icon: <Package className="h-4 w-4" />, label: "Product" },
    { id: "customer", icon: <User className="h-4 w-4" />, label: "Customer" },
    { id: "supplier", icon: <Truck className="h-4 w-4" />, label: "Supplier" },
    { id: "stock", icon: <BarChart2 className="h-4 w-4" />, label: "Stock" },
    { id: "accounting", icon: <Calculator className="h-4 w-4" />, label: "Accounting" },
  ]

  // Primary tabs for bottom navigation (most used)
  const primaryTabs = ["home", "sale", "purchase", "product"]
  const secondaryTabs = ["customer", "supplier", "stock", "accounting"]

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
          <div className="hidden sm:flex items-center space-x-4">
            {/* Animated Theme Toggle */}
            <AnimatedThemeToggle />

            {/* Add Sale Button */}
            <Button
              onClick={handleHeaderSaleClick}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <Plus className="h-4 w-4" />
              <span>Add Sale</span>
            </Button>

            {/* Staff Dropdown */}
            <StaffHeaderDropdown deviceId={device?.id || null} userId={user?.id || null} />

            {/* Direct Logout Button */}
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              title="Logout"
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Controls */}
          <div className="flex sm:hidden items-center space-x-2">
            <AnimatedThemeToggle />
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
            {/* Add Sale Button */}
            <Button
              onClick={handleHeaderSaleClick}
              variant="outline"
              size="sm"
              className="w-full flex items-center justify-center gap-2 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
            >
              <Plus className="h-4 w-4" />
              Add Sale
            </Button>
            
            {/* Staff Dropdown Section */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Account
              </p>
              <div className="space-y-2">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <StaffHeaderDropdown deviceId={device?.id || null} userId={user?.id || null} />
                </div>
              </div>
            </div> 
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-6 pb-4 sm:pb-20">
        {/* Database Error Alert */}
        {dbError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database Connection Error</AlertTitle>
            <AlertDescription>{dbError} Some features may be limited.</AlertDescription>
          </Alert>
        )}

        {/* Tab Content */}
        <div className="pb-4 mb-20 sm:mb-0">{renderTabContent()}</div>
      </main>

      {/* Bottom Navigation - Always visible mobile footer */}
      <div className="sm:hidden">
        {/* Mobile Footer Container - Fixed at bottom */}
        <div className="fixed inset-x-0 bottom-0 z-50">
          {/* Expanded Drawer - Secondary Items */}
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

          {/* Main Footer - Primary Items + Expand Button */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-safe">
            <div className="grid grid-cols-5 h-16">
              {/* First 4 primary tabs */}
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
              
              {/* Expand/Collapse Button */}
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

      {/* Desktop: Sticky navigation */}
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

      {/* Header Sale Modal */}
      <NewSaleModal
        isOpen={isHeaderSaleModalOpen}
        onClose={handleHeaderSaleModalClose}
        userId={user?.id || 0}
        currency={device?.currency || "AED"}
      />
    </div>
  )
}

interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}

function NavItem({ icon, label, isActive, onClick }: NavItemProps) {
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
}

function SecondaryNavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      className={`flex flex-1 flex-row items-center justify-center gap-1 transition-all duration-200 py-2 ${
        isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
      }`}
      onClick={onClick}
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
  )
}

function MobileNavItem({ icon, label, isActive, onClick }: NavItemProps) {
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
}

// Add default export
export default Dashboard