"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  LogOut, 
  UserCircle,
  Menu,
  X,
  CreditCard,
  Package
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { staffLogout } from "@/app/actions/staff-auth-actions"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { clearDeviceData, selectDevice } from "@/store/slices/deviceSlice"
import { clearStaff } from "@/store/slices/staffSlice"
import { useToast } from "@/components/ui/use-toast"
import { BrandLogo } from "@/components/brand-logo"
import StaffAttendance from "./staff-attendance"
import StaffInventoryTab from "./staff-inventory-tab"
import { JobCardForm, TodaySalesList } from "./job-card"
import { StaffCustomerTab } from "./customers/staff-customer-tab"

type Tab = "home" | "sales" | "create-sale" | "customers" | "attendance" | "inventory"

export default function StaffDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const dispatch = useAppDispatch()
  const device = useAppSelector(selectDevice)

  const handleLogout = async () => {
    try {
      // Clear localStorage for this device
      if (device?.id && typeof window !== "undefined") {
        localStorage.removeItem(`staff_session_device_${device.id}`)
      }
      // Clear Redux state so LoginForm does not redirect back
      dispatch(clearDeviceData())
      dispatch(clearStaff())
      // Clear the ims_staff_session JWT cookie
      await staffLogout()
      router.replace("/")
    } catch (error) {
      // Even if the server call fails, clear local state and redirect
      dispatch(clearDeviceData())
      dispatch(clearStaff())
      if (typeof window !== "undefined") {
        localStorage.removeItem("deviceState")
      }
      router.replace("/")
    }
  }

  const NavigationMenu = () => (
    <nav className="flex-1 space-y-1 p-2">
      <Button
        variant={activeTab === "home" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => { setActiveTab("home"); setIsMobileMenuOpen(false) }}
      >
        <LayoutDashboard className="mr-3 h-5 w-5" />
        Dashboard Home
      </Button>
      <Button
        variant={activeTab === "sales" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => { setActiveTab("sales"); setIsMobileMenuOpen(false) }}
      >
        <CreditCard className="mr-3 h-5 w-5" />
        Today's Sales
      </Button>
      <Button
        variant={activeTab === "create-sale" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => {
          // Alternatively, this could link out to the main POS 
          setActiveTab("create-sale"); 
          setIsMobileMenuOpen(false)
        }}
      >
        <ShoppingCart className="mr-3 h-5 w-5" />
        Create Job Card
      </Button>
      <Button
        variant={activeTab === "customers" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => { setActiveTab("customers"); setIsMobileMenuOpen(false) }}
      >
        <Users className="mr-3 h-5 w-5" />
        Customer List
      </Button>
      <Button
        variant={activeTab === "inventory" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => { setActiveTab("inventory"); setIsMobileMenuOpen(false) }}
      >
        <Package className="mr-3 h-5 w-5" />
        Inventory
      </Button>
      <Button
        variant={activeTab === "attendance" ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => { setActiveTab("attendance"); setIsMobileMenuOpen(false) }}
      >
        <UserCircle className="mr-3 h-5 w-5" />
        My Attendance
      </Button>
    </nav>
  )

  return (
    <div className="flex h-full w-full">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r">
        <div className="flex flex-col flex-grow pt-5 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4 mb-5">
            <BrandLogo />
          </div>
          <div className="px-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Portal</p>
          </div>
          <NavigationMenu />
        </div>
        <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
          <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
            <LogOut className="mr-3 h-5 w-5" />
            Logout
          </Button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-10 bg-white border-b flex justify-between items-center p-4">
        <BrandLogo className="h-8 w-auto" />
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <Button variant="ghost" size="icon" className="text-white" onClick={() => setIsMobileMenuOpen(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4 mb-5">
                <BrandLogo />
              </div>
              <NavigationMenu />
            </div>
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
                <LogOut className="mr-3 h-5 w-5" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-full md:pl-64 pt-16 md:pt-0">
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === "home" && (
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 mb-6">Welcome to Staff Portal</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                    <h3 className="text-lg font-medium text-gray-900">Today's Performance</h3>
                    <p className="mt-2 text-sm text-gray-500">View your sales and activity for today.</p>
                    <Button className="mt-4" variant="outline" onClick={() => setActiveTab("sales")}>View Sales</Button>
                  </div>
                  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                    <h3 className="text-lg font-medium text-gray-900">New Transaction</h3>
                    <p className="mt-2 text-sm text-gray-500">Quickly start a new sale or invoice.</p>
                    <Button className="mt-4" onClick={() => {
                      // Standard behavior usually redirects to the main app dashboard for creating sales
                      // assuming the staff session gives them access.
                      router.push("/dashboard?tab=sale")
                    }}>Open POS</Button>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === "sales" && (
              <TodaySalesList />
            )}

            {activeTab === "create-sale" && (
              <JobCardForm />
            )}

            {activeTab === "customers" && (
              <StaffCustomerTab 
                onTabChange={setActiveTab}
                currency={device?.currency || "AED"} 
              />
            )}

            {activeTab === "attendance" && (
              <StaffAttendance />
            )}

            {activeTab === "inventory" && (
              <div className="h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)] -mx-6 -mt-6">
                <StaffInventoryTab />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
