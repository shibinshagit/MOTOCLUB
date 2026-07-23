"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { User, Mail, Phone, MapPin, Calendar, ShoppingBag, Car, FileText, Share2, ClipboardList, Wallet } from "lucide-react"

interface StaffViewCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  customer: any
  currency?: string
}

export default function StaffViewCustomerModal({ isOpen, onClose, customer, currency = "AED" }: StaffViewCustomerModalProps) {
  if (!customer) return null

  const getCustomerType = (orderCount: number) => {
    if (orderCount >= 20) return { label: "VIP Customer", color: "bg-purple-100 text-purple-800 border-purple-200" }
    if (orderCount >= 10) return { label: "Premium", color: "bg-blue-100 text-blue-800 border-blue-200" }
    if (orderCount >= 5) return { label: "Regular", color: "bg-green-100 text-green-800 border-green-200" }
    return { label: "New", color: "bg-gray-100 text-gray-800 border-gray-200" }
  }

  const customerType = getCustomerType(Number(customer.order_count) || 0)

  const handleShare = async () => {
    const text = `👤 Customer: ${customer.name}\n📞 Phone: ${customer.phone || "N/A"}\n✉️ Email: ${customer.email || "N/A"}\n📍 Address: ${customer.address || "N/A"}\n🚗 Vehicle: ${customer.vehicle_details || "N/A"}\n📝 Notes: ${customer.notes || "N/A"}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Customer: ${customer.name}`,
          text: text,
        })
      } catch (err) {
        // ignore aborts
      }
    } else {
      await navigator.clipboard.writeText(text)
      alert("Customer details copied to clipboard")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-50">
        <DialogHeader className="pb-4">
          <div className="flex justify-between items-start">
            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                {customer.name}
                <div className="text-xs font-normal text-slate-500 mt-1 flex items-center gap-2">
                  ID: {customer.id}
                  <Badge variant="outline" className={customerType.color}>
                    {customerType.label}
                  </Badge>
                </div>
              </div>
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2 text-slate-600">
              <Share2 className="h-4 w-4" />
              Share Profile
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" /> Contact Information
            </h3>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-slate-400 mt-1" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Phone Number</p>
                  <p className="text-sm font-medium text-slate-900">{customer.phone || "Not provided"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-slate-400 mt-1" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Email Address</p>
                  <p className="text-sm font-medium text-slate-900">{customer.email || "Not provided"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-slate-400 mt-1" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Address</p>
                  <p className="text-sm font-medium text-slate-900">{customer.address || "Not provided"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-slate-400 mt-1" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Registered Since</p>
                  <p className="text-sm font-medium text-slate-900">
                    {customer.created_at ? format(new Date(customer.created_at), "MMM d, yyyy") : "Unknown"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle & Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Car className="h-4 w-4 text-slate-500" /> Vehicle & Additional Details
            </h3>
            <Separator />
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <Car className="h-3 w-3" /> Vehicle Details
                </p>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-700 min-h-[60px]">
                  {customer.vehicle_details || "No vehicle details provided."}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Customer Notes
                </p>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-slate-700 min-h-[60px]">
                  {customer.notes || "No notes available."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Summary */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <ClipboardList className="h-4 w-4 text-slate-500" /> Activity Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex flex-col justify-center items-center text-center">
              <ShoppingBag className="h-6 w-6 text-blue-500 mb-2" />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Purchases</p>
              <p className="text-xl font-bold text-slate-900">{customer.order_count || 0}</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex flex-col justify-center items-center text-center">
              <Calendar className="h-6 w-6 text-emerald-500 mb-2" />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Last Visit</p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {customer.last_visit ? format(new Date(customer.last_visit), "MMM d, yyyy") : "Never"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex flex-col justify-center items-center text-center">
              <Wallet className="h-6 w-6 text-amber-500 mb-2" />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
              <p className="text-xl font-bold text-amber-600 mt-1">
                {currency} {Number(customer.outstanding_amount || 0).toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Read-only Summary</p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button onClick={onClose} variant="outline" className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
