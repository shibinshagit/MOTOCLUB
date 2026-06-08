"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Loader2, Search, User, X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCustomers } from "@/app/actions/customer-actions"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

import { useAppDispatch } from "@/store/hooks"
import { addCustomer as addCustomerAction } from "@/store/slices/customerSlice"

interface CustomerSelectSimpleProps {
  id?: string
  value: number | null
  onChange: (value: number, name: string) => void
  onAddNew: () => void
  onCreateCustomer?: (name: string, phone: string) => Promise<{ success: boolean; data?: any; message?: string }>
  userId?: number
  showAddNewButton?: boolean
}

export default function CustomerSelectSimple({
  id,
  value,
  onChange,
  onAddNew,
  onCreateCustomer,
  userId = 1,
  showAddNewButton = true,
}: CustomerSelectSimpleProps) {
  const dispatch = useAppDispatch()

  const [open, setOpen] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([])
  const [recentCustomers, setRecentCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: "", phone: "" })
  const [formLoading, setFormLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<{ name?: string; phone?: string }>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  // Load customers when component mounts or when userId changes
  useEffect(() => {
    fetchCustomers()
    loadRecentCustomers()
  }, [userId])

  // Filter customers and open inline form when there are no matches
  useEffect(() => {
    // If empty search, show all and keep form open if user manually opened it
    if (!searchTerm.trim()) {
      setFilteredCustomers(customers)
      if (!showForm) {
        setFormData({ name: "", phone: "" })
        setFormErrors({})
      }
      return
    }

    const searchLower = searchTerm.toLowerCase()
    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(searchLower) ||
        (customer.phone && customer.phone.includes(searchTerm)) ||
        (customer.email && customer.email.toLowerCase().includes(searchLower))
    )
    setFilteredCustomers(filtered)

    // Only open inline form if search term is at least 3 characters
    if (
      filtered.length === 0 &&
      searchTerm.trim().length >= 3 &&
      !showForm
    ) {
      const currentSearchTerm = searchTerm.trim()
      const cleaned = currentSearchTerm.replace(/[^\d]/g, "")
      const isAllDigits = /^\d+$/.test(cleaned)
      if (isAllDigits && cleaned.length > 0) {
        setFormData({ name: "", phone: currentSearchTerm })
      } else {
        setFormData({ name: currentSearchTerm, phone: "" })
      }
      setShowForm(true)
      setSearchTerm("")
    }
  }, [searchTerm, customers, showForm])

  // Focus correct input once showForm or formData changes
  useEffect(() => {
    if (!showForm) return

    const t = setTimeout(() => {
      if (formData.phone) {
        phoneInputRef.current?.focus()
        // place cursor at end
        const el = phoneInputRef.current
        if (el) el.selectionStart = el.selectionEnd = el.value.length
      } else {
        nameInputRef.current?.focus()
        const el = nameInputRef.current
        if (el) el.selectionStart = el.selectionEnd = el.value.length
      }
    }, 80)

    return () => clearTimeout(t)
  }, [showForm, formData.phone, formData.name])

  // Set selected customer when external value changes
  useEffect(() => {
    if (value) {
      const c = customers.find((c) => c.id === value)
      setSelectedCustomer(c ?? null)
    } else {
      setSelectedCustomer(null)
    }
  }, [value, customers])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowForm(false)
        setFormData({ name: "", phone: "" })
        setFormErrors({})
        setSearchTerm("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 80)
    }
  }, [open])

  useEffect(() => {
  if (showForm && !formData.name.trim() && !formData.phone.trim()) {
    setShowForm(false)
    setFormErrors({})
    setSearchTerm("")
  }
}, [formData, showForm])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const res = await getCustomers(userId)
      if (res.success) {
        setCustomers(res.data)
        setFilteredCustomers(res.data)
      } else {
        console.error("Failed to load customers:", res.message)
      }
    } catch (err) {
      console.error("Error fetching customers:", err)
    } finally {
      setLoading(false)
    }
  }

  const loadRecentCustomers = () => {
    try {
      const stored = localStorage.getItem(`recent-customers-${userId}`)
      if (stored) setRecentCustomers(JSON.parse(stored).slice(0, 3))
    } catch (err) {
      console.error("Error loading recent customers:", err)
    }
  }

  const handleCustomerSelect = (customerId: number, customerName: string) => {
    onChange(customerId, customerName)
    setOpen(false)
    setShowForm(false)
    setFormData({ name: "", phone: "" })
    setSearchTerm("")

    // Save to recent customers
    try {
      const customer = customers.find((c) => c.id === customerId)
      if (customer) {
        const stored = localStorage.getItem(`recent-customers-${userId}`) || "[]"
        const list = JSON.parse(stored)
        const filtered = list.filter((c: any) => c.id !== customerId)
        filtered.unshift(customer)
        const newRecent = filtered.slice(0, 5)
        localStorage.setItem(`recent-customers-${userId}`, JSON.stringify(newRecent))
        setRecentCustomers(newRecent.slice(0, 3))
      }
    } catch (err) {
      console.error("Error saving recent customer:", err)
    }
  }

  const validateForm = () => {
    const errors: { name?: string; phone?: string } = {}
    if (!formData.name.trim()) errors.name = "Name is required"
    if (!formData.phone.trim()) errors.phone = "Phone number is required"
    else {
      const cleanPhone = formData.phone.replace(/[\s\-\(\)\.]/g, "")
      if (!/^\d{7,15}$/.test(cleanPhone)) errors.phone = "Please enter a valid phone number"
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Fallback create function that mirrors CustomerTab.handleAddCustomer
  const createCustomerApi = async (name: string, phone: string) => {
    try {
      const body = new FormData()
      body.append("user_id", String(userId))
      body.append("name", name)
      body.append("phone", phone)
      // leave email/address empty in this quick path
      const response = await fetch("/api/customers", {
        method: "POST",
        body,
      })
      const result = await response.json()
      if (result.success && result.data) {
        // keep global redux in sync
        dispatch(addCustomerAction(result.data))
      }
      return result
    } catch (error) {
      console.error("Error creating customer via API:", error)
      return { success: false, message: "Network error" }
    }
  }

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setFormLoading(true)
    try {
      const createFn = onCreateCustomer ?? createCustomerApi
      const result = await createFn(formData.name.trim(), formData.phone.trim())

      if (result.success && result.data) {
        const newCustomer = result.data
        // Keep local list in sync
        setCustomers((prev) => [newCustomer, ...prev])
        setFilteredCustomers((prev) => [newCustomer, ...prev])

        // Select the newly created customer
        handleCustomerSelect(newCustomer.id, newCustomer.name)

        // Reset form
        setFormData({ name: "", phone: "" })
        setFormErrors({})
        setShowForm(false)
        setSearchTerm("")
      } else {
        // show the error message in the form
        setFormErrors({ name: result.message || "Failed to create customer" })
      }
    } catch (err) {
      console.error("Error creating customer:", err)
      setFormErrors({ name: "Failed to create customer. Please try again." })
    } finally {
      setFormLoading(false)
    }
  }

  const handleFormInputChange = (field: "name" | "phone", value: string) => {
    setFormData((p) => ({ ...p, [field]: value }))
    if (formErrors[field]) setFormErrors((p) => ({ ...p, [field]: undefined }))
  }

  const resetSearchAndForm = () => {
    setSearchTerm("")
    setShowForm(false)
    setFormData({ name: "", phone: "" })
    setFormErrors({})
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    // If user cleared search while inline form is visible, keep inline form if they edited it.
    if (showForm && value === "") {
      // no-op (we don't auto-close form here)
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        id={id}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "w-full justify-between transition-all duration-200 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700",
          value ? "bg-gray-50 dark:bg-gray-700" : ""
        )}
        type="button"
        onClick={() => {
          setOpen(!open)
          if (!open) {
            fetchCustomers()
            resetSearchAndForm()
          }
        }}
      >
        {selectedCustomer ? (
          <div className="flex items-center">
            <User className="mr-2 h-4 w-4 text-gray-500" />
            <span>{selectedCustomer.name}</span>
          </div>
        ) : (
          "Select customer..."
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600 shadow-lg overflow-hidden"
        >
          {/* Search Header */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search customers or add new..."
              className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={resetSearchAndForm}
              >
                <X className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              </Button>
            )}
          </div>

          {/* Content Area */}
          <div className="max-h-[400px] overflow-y-auto p-1">
            {loading ? (
              <div className="py-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading customers...</p>
              </div>
            ) : showForm ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 m-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Create New Customer</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-blue-200 dark:hover:bg-blue-800"
                    onClick={resetSearchAndForm}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <form onSubmit={handleCreateCustomer} className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Name</label>
                    <Input
                      ref={nameInputRef}
                      placeholder="Enter customer name"
                      value={formData.name}
                      onChange={(e) => handleFormInputChange("name", e.target.value)}
                      className={cn(
                        "h-9 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
                        formErrors.name ? "border-red-300 dark:border-red-600 focus-visible:ring-red-500" : "border-gray-300 dark:border-gray-600"
                      )}
                      disabled={formLoading}
                    />
                    {formErrors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Phone Number</label>
                    <Input
                      ref={phoneInputRef}
                      placeholder="Enter phone number"
                      value={formData.phone}
                      onChange={(e) => handleFormInputChange("phone", e.target.value)}
                      className={cn(
                        "h-9 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
                        formErrors.phone ? "border-red-300 dark:border-red-600 focus-visible:ring-red-500" : "border-gray-300 dark:border-gray-600"
                      )}
                      disabled={formLoading}
                    />
                    {formErrors.phone && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.phone}</p>}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" className="flex-1 h-9 text-sm bg-blue-600 hover:bg-blue-700" disabled={formLoading}>
                      {formLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          Creating...
                        </>
                      ) : (
                        "Create Customer"
                      )}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 text-sm" onClick={resetSearchAndForm} disabled={formLoading}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                {/* Recent */}
                {recentCustomers.length > 0 && !searchTerm && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">
                      <span>Recent</span>
                      <Badge variant="outline" className="ml-2 text-xs py-0">
                        {recentCustomers.length}
                      </Badge>
                    </div>
                    {recentCustomers.map((customer) => (
                      <button
                        key={`recent-${customer.id}`}
                        type="button"
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2",
                          "hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                          value === customer.id ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-100"
                        )}
                        onClick={() => handleCustomerSelect(customer.id, customer.name)}
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{customer.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{customer.phone || customer.email || "No contact info"}</div>
                        </div>
                        {value === customer.id && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-600"></div>
                  </div>
                )}

                {/* Filtered / All */}
                {filteredCustomers.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">
                      <span>{searchTerm ? "Search Results" : "All Customers"}</span>
                      <Badge variant="outline" className="ml-2 text-xs py-0">
                        {filteredCustomers.length}
                      </Badge>
                    </div>
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2",
                          "hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                          value === customer.id ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-gray-100"
                        )}
                        onClick={() => handleCustomerSelect(customer.id, customer.name)}
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{customer.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{customer.phone || customer.email || "No contact info"}</div>
                        </div>
                        {value === customer.id && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Empty / No results */}
                {filteredCustomers.length === 0 && !showForm && searchTerm && (
                  <div className="py-4 text-center">
                    <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No customers found</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search or create a new customer</p>
                  </div>
                )}

                {/* Add New inline trigger */}
                {!searchTerm && !showForm && showAddNewButton && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600 px-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
                      onClick={() => {
                        setOpen(false)
                        resetSearchAndForm()
                        onAddNew()
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Customer
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

