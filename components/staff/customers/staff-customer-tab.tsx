"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  User,
  Plus,
  Search,
  X,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  Car,
  ShoppingCart,
  MessageCircle,
} from "lucide-react"
import StaffCustomerFormModal from "./staff-customer-form-modal"
import StaffViewCustomerModal from "./staff-view-customer-modal"
import { useToast } from "@/components/ui/use-toast"
import { notifyError } from "@/lib/notifications"
import { getStaffCustomers, type StaffCustomer } from "@/app/actions/staff-customer-actions"
import { formatDistanceToNow } from "date-fns"
import { useRouter } from "next/navigation"

export function StaffCustomerTab({ currency = "AED", onTabChange }: { currency?: string, onTabChange?: (tab: any) => void }) {
  const [customers, setCustomers] = useState<StaffCustomer[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<StaffCustomer | null>(null)
  
  const { toast } = useToast()
  const router = useRouter()

  const loadCustomers = useCallback(
    async (search = "", isBgRefresh = false) => {
      if (!isBgRefresh) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      try {
        const result = await getStaffCustomers(search)
        if (result.success && result.data) {
          setCustomers(result.data as StaffCustomer[])
        } else {
          notifyError(toast, result.message || "Failed to load customers")
        }
      } catch (error) {
        notifyError(toast, "An unexpected error occurred")
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
        setIsSearching(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(true)
    loadCustomers(searchTerm)
  }

  const handleClearSearch = () => {
    setSearchTerm("")
    setIsSearching(true)
    loadCustomers("")
  }

  const handleRefresh = () => {
    loadCustomers(searchTerm, true)
  }

  const handleViewCustomer = (customer: StaffCustomer) => {
    setSelectedCustomer(customer)
    setIsViewModalOpen(true)
  }

  const handleEditCustomer = (customer: StaffCustomer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const getCustomerType = (orderCount: number) => {
    if (orderCount >= 20) return { label: "VIP", color: "bg-purple-100 text-purple-800 border-purple-200" }
    if (orderCount >= 10) return { label: "Premium", color: "bg-blue-100 text-blue-800 border-blue-200" }
    if (orderCount >= 5) return { label: "Regular", color: "bg-green-100 text-green-800 border-green-200" }
    return { label: "New", color: "bg-gray-100 text-gray-800 border-gray-200" }
  }

  const handleCreateSale = (customer: StaffCustomer) => {
    if (onTabChange) {
      onTabChange("create-sale") // Route to Job Card creation
    } else {
      router.push(`/dashboard?tab=sale&customer=${customer.id}`)
    }
  }

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`
  }

  const handleWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "")
    window.open(`https://wa.me/${cleanPhone}?text=Hi ${name},`, "_blank")
  }

  const handleEmail = (email: string) => {
    window.location.href = `mailto:${email}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h2>
          <p className="text-sm text-slate-500">Manage your customer relationships and view history.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, phone, email, or vehicle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={isSearching || isLoading}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Status / Type</th>
                <th className="px-6 py-4 font-semibold text-right">Summary</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300" />
                    <p className="mt-2 text-slate-500">Loading customers...</p>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <User className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-base font-medium text-slate-900">No customers found</p>
                      <p className="text-sm mt-1">Try adjusting your search or add a new customer.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  const type = getCustomerType(Number(customer.order_count) || 0)
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{customer.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Phone className="h-3 w-3" /> {customer.phone}
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="h-3 w-3" /> {customer.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${type.color}`}>
                          {type.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-medium text-slate-900">{customer.order_count} Orders</div>
                        {customer.last_visit ? (
                          <div className="text-xs text-slate-500">
                            Visited {formatDistanceToNow(new Date(customer.last_visit))} ago
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">No visits yet</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => handleViewCustomer(customer)} title="View Profile">
                            <User className="h-4 w-4" />
                          </Button>
                          {customer.phone && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => handleWhatsApp(customer.phone, customer.name)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-600" onClick={() => handleCreateSale(customer)} title="New Job Card">
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StaffCustomerFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => loadCustomers(searchTerm, true)}
      />

      <StaffCustomerFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => loadCustomers(searchTerm, true)}
        customerToEdit={selectedCustomer}
      />

      <StaffViewCustomerModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        customer={selectedCustomer}
        currency={currency}
      />
    </div>
  )
}
