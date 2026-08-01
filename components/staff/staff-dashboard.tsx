"use client"

import { useState, useEffect } from "react"
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
  Package,
  Plus,
  Banknote,
  DollarSign,
  AlertTriangle,
  Calendar as CalendarIcon,
  TrendingUp,
  Activity
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { staffLogout } from "@/app/actions/staff-auth-actions"
import { getStaffDashboardStats } from "@/app/actions/staff-actions"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { clearDeviceData, selectDevice } from "@/store/slices/deviceSlice"
import { clearStaff } from "@/store/slices/staffSlice"
import { useToast } from "@/components/ui/use-toast"
import { BrandLogo } from "@/components/brand-logo"
import StaffAttendance from "./staff-attendance"
import StaffInventoryTab from "./staff-inventory-tab"
import { TodaySalesList } from "@/components/shared/job-card"
import { JobCardModal } from "@/components/shared/job-card/job-card-modal"
import { StaffCustomerTab } from "./customers/staff-customer-tab"
import { StaffSalesChart } from "./staff-sales-chart"

type Tab = "home" | "sales" | "customers" | "attendance" | "inventory"

export default function StaffDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isJobCardModalOpen, setIsJobCardModalOpen] = useState(false)
  const [chartSummary, setChartSummary] = useState({ sales: 0, orders: 0 })
  const [dashboardStats, setDashboardStats] = useState<any>(null)
  const router = useRouter()
  const { toast } = useToast()
  const dispatch = useAppDispatch()
  const device = useAppSelector(selectDevice)

  useEffect(() => {
    if (activeTab === "home" && device?.id) {
      getStaffDashboardStats(device.id).then(res => {
        if (res.success) setDashboardStats(res.data)
      })
    }
  }, [activeTab, device?.id])

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
            {device?.name && (
              <p className="text-sm font-medium text-slate-800 mt-1 truncate" title={device.name}>
                {device.name}
              </p>
            )}
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
              <div className="px-4 pb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Portal</p>
                {device?.name && (
                  <p className="text-sm font-medium text-slate-800 mt-1 truncate" title={device.name}>
                    {device.name}
                  </p>
                )}
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
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h1 className="text-2xl font-semibold text-gray-900">Welcome to Staff Portal</h1>
                  <Button onClick={() => setIsJobCardModalOpen(true)} className="whitespace-nowrap">
                    <Plus className="mr-2 h-4 w-4" /> Create Job Card
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Total Orders */}
                  <div className="bg-gradient-to-br from-[#2979ff] to-[#1565c0] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                      <Package className="h-20 w-20" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Orders</p>
                        <Package className="h-5 w-5 text-blue-200" />
                      </div>
                      <h3 className="mt-2 text-3xl font-extrabold">{dashboardStats?.totalOrders || 0}</h3>
                      <p className="mt-2 text-[11px] font-medium text-blue-100">All time entries</p>
                    </div>
                  </div>
                  {/* Total Sale Amount */}
                  <div className="bg-gradient-to-br from-[#f50057] to-[#c51162] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                      <Banknote className="h-20 w-20" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-pink-100">Total Sale Amount</p>
                        <Banknote className="h-5 w-5 text-pink-200" />
                      </div>
                      <h3 className="mt-2 text-3xl font-extrabold truncate">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: device?.currency || "INR", maximumFractionDigits: 0 }).format(dashboardStats?.totalSaleAmount || 0).replace(/^[a-zA-Z]+/, (match) => match + " ")}
                      </h3>
                      <p className="mt-2 text-[11px] font-medium text-pink-100">Sum of Total Paid</p>
                    </div>
                  </div>
                  {/* Total Profit */}
                  <div className="bg-gradient-to-br from-[#00c853] to-[#00b0ff] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                      <DollarSign className="h-20 w-20" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Total Profit</p>
                        <DollarSign className="h-5 w-5 text-emerald-200" />
                      </div>
                      <h3 className="mt-2 text-3xl font-extrabold truncate">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: device?.currency || "INR", maximumFractionDigits: 0 }).format(dashboardStats?.totalProfit || 0).replace(/^[a-zA-Z]+/, (match) => match + " ")}
                      </h3>
                      <p className="mt-2 text-[11px] font-medium text-emerald-100">+12% from last month</p>
                    </div>
                  </div>
                  {/* Today's Activity */}
                  <div className="bg-gradient-to-br from-[#7c4dff] to-[#651fff] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                      <Activity className="h-20 w-20" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-violet-100">Today's Activity</p>
                        <CalendarIcon className="h-5 w-5 text-violet-200" />
                      </div>
                      <h3 className="mt-2 text-3xl font-extrabold">{dashboardStats?.todaysActivity || 0}</h3>
                      <p className="mt-2 text-[11px] font-medium text-violet-100">Orders processing</p>
                    </div>
                  </div>
                  {/* Pending Costs */}
                  <div className="bg-gradient-to-br from-[#ff9100] to-[#ff3d00] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                      <AlertTriangle className="h-20 w-20" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-orange-100">Pending Costs</p>
                        <AlertTriangle className="h-5 w-5 text-orange-200" />
                      </div>
                      <h3 className="mt-2 text-3xl font-extrabold">{dashboardStats?.pendingCosts || 0}</h3>
                      <p className="mt-2 text-[11px] font-medium text-orange-100">Needs attention</p>
                    </div>
                  </div>
                </div>

                <div className="w-full">
                  {device?.id && (
                    <StaffSalesChart 
                      deviceId={device.id}
                      currency={device?.currency || "INR"} 
                      onSummaryUpdate={setChartSummary} 
                    />
                  )}
                </div>

                <div className="w-full mt-8 border-t pt-8">
                  <TodaySalesList onOpenCreateModal={() => setIsJobCardModalOpen(true)} />
                </div>
              </div>
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
      <JobCardModal
        isOpen={isJobCardModalOpen} onClose={() => setIsJobCardModalOpen(false)} />
    </div>
  )
}
