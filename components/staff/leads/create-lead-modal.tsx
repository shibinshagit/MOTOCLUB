"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { createManualLead } from "@/app/actions/lead-actions"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import { 
  UserPlus, 
  Phone, 
  Mail, 
  Car, 
  Calendar, 
  Briefcase, 
  Package, 
  Trash2, 
  Loader2, 
  PlusCircle,
  Tag
} from "lucide-react"

const SOURCE_OPTIONS = [
  "Walk-in",
  "Phone Call",
  "WhatsApp",
  "Instagram DM",
  "Website",
  "Referral",
  "Other"
]

const STATUS_OPTIONS = [
  "New",
  "Assigned",
  "Contacted",
  "Follow Up",
  "Interested"
]

interface SelectedProductItem {
  productId: number
  variantId: number | null
  name: string
  price: number
  stock?: number
}

interface CreateLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  staffList: { id: number; name: string; role?: string }[]
  currentStaffId?: number
}

export function CreateLeadModal({
  isOpen,
  onClose,
  onSuccess,
  staffList,
  currentStaffId
}: CreateLeadModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // Form Fields
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("Walk-in")
  const [customSource, setCustomSource] = useState("")
  const [campaign, setCampaign] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [year, setYear] = useState("")
  const [status, setStatus] = useState("New")
  const [assignedTo, setAssignedTo] = useState<string>(
    currentStaffId ? String(currentStaffId) : "unassigned"
  )
  const [followUpDate, setFollowUpDate] = useState("")
  const [notes, setNotes] = useState("")

  // Products
  const [selectedProducts, setSelectedProducts] = useState<SelectedProductItem[]>([])
  const [showProductPicker, setShowProductPicker] = useState(false)

  const resetForm = () => {
    setName("")
    setPhone("")
    setEmail("")
    setSource("Walk-in")
    setCustomSource("")
    setCampaign("")
    setVehicle("")
    setYear("")
    setStatus("New")
    setAssignedTo(currentStaffId ? String(currentStaffId) : "unassigned")
    setFollowUpDate("")
    setNotes("")
    setSelectedProducts([])
    setShowProductPicker(false)
  }

  const handleClose = () => {
    if (loading) return
    resetForm()
    onClose()
  }

  const handleAddProduct = (
    productId: number,
    productName: string,
    price: number,
    _wholesalePrice?: number,
    stock?: number,
    fullItem?: any
  ) => {
    const variantId = fullItem?.variant_id || fullItem?.product_variant_id || null

    // Check if already in list
    const alreadyExists = selectedProducts.some(
      (p) => p.productId === productId && p.variantId === variantId
    )

    if (alreadyExists) {
      toast({ title: "Product already added to list", variant: "default" })
      setShowProductPicker(false)
      return
    }

    setSelectedProducts((prev) => [
      ...prev,
      {
        productId,
        variantId,
        name: productName,
        price,
        stock
      }
    ])
    setShowProductPicker(false)
  }

  const handleRemoveProduct = (index: number) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: "Customer name is required",
        variant: "destructive"
      })
      return
    }

    setLoading(true)

    try {
      const finalSource = source === "Other" && customSource.trim() ? customSource.trim() : source
      const finalAssignedTo = assignedTo && assignedTo !== "unassigned" ? Number(assignedTo) : null

      const res = await createManualLead({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        source: finalSource,
        campaign: campaign.trim() || null,
        vehicle: vehicle.trim() || null,
        year: year.trim() || null,
        message: notes.trim() || null,
        notes: notes.trim() || null,
        status,
        assigned_to: finalAssignedTo,
        next_follow_up_at: followUpDate ? new Date(followUpDate).toISOString() : null,
        products: selectedProducts.map((p) => ({
          product_id: p.productId,
          product_variant_id: p.variantId
        }))
      })

      if (res.success) {
        toast({
          title: "Lead Created Successfully",
          description: `Lead #${res.leadNumber} has been recorded.`
        })
        resetForm()
        onSuccess()
        onClose()
      } else {
        toast({
          title: "Failed to create lead",
          description: res.message || "An unexpected error occurred",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Error creating lead",
        description: err?.message || "Please check your network connection and try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">New Manual Lead</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Record an in-store walk-in, phone inquiry, WhatsApp, or direct lead.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
          {/* Section: Customer Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Customer Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="lead-name" className="text-xs font-medium">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lead-name"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-phone" className="text-xs font-medium">
                  Phone Number
                </Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lead-phone"
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    className="pl-8"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-email" className="text-xs font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lead-email"
                    type="email"
                    placeholder="e.g. john@example.com"
                    className="pl-8"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Lead Source & Vehicle */}
          <div className="space-y-3 pt-1 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Source & Vehicle Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Lead Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {source === "Other" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="custom-source" className="text-xs font-medium">
                    Specify Custom Source
                  </Label>
                  <Input
                    id="custom-source"
                    placeholder="e.g. Exhibition, Friend referral..."
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="lead-campaign" className="text-xs font-medium">
                    Campaign / Promotion (Optional)
                  </Label>
                  <Input
                    id="lead-campaign"
                    placeholder="e.g. Diwali Walk-in, In-Store Offer"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="lead-vehicle" className="text-xs font-medium">
                  Vehicle Model
                </Label>
                <div className="relative">
                  <Car className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lead-vehicle"
                    placeholder="e.g. Yamaha R15 V4, RE Classic 350"
                    className="pl-8"
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-year" className="text-xs font-medium">
                  Model Year
                </Label>
                <Input
                  id="lead-year"
                  placeholder="e.g. 2023 / 2024"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Status & Assignment */}
          <div className="space-y-3 pt-1 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Management & Follow-Up
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Initial Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Assign To</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} {s.role ? `(${s.role})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-followup" className="text-xs font-medium">
                  Next Follow-Up
                </Label>
                <Input
                  id="lead-followup"
                  type="datetime-local"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Interested Products (Optional) */}
          <div className="space-y-3 pt-1 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Interested Products (Optional)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowProductPicker((prev) => !prev)}
                className="h-7 text-xs text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 gap-1"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                {showProductPicker ? "Close Picker" : "Add Product"}
              </Button>
            </div>

            {showProductPicker && (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30 space-y-2">
                <div className="text-xs font-medium text-slate-700 flex justify-between">
                  <span>Search & Select Product from Catalog</span>
                  <span className="text-[11px] text-muted-foreground">Type name or code to search</span>
                </div>
                <ProductSelectSimple
                  value={null}
                  onChange={handleAddProduct}
                  allowAddNew={false}
                  allowServices={false}
                  autoOpen={true}
                />
              </div>
            )}

            {selectedProducts.length > 0 && (
              <div className="space-y-2">
                {selectedProducts.map((p, idx) => (
                  <div
                    key={`${p.productId}-${p.variantId || "base"}-${idx}`}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border rounded-md text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Package className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <span className="font-medium text-foreground">{p.name}</span>
                        <div className="text-[11px] text-muted-foreground">
                          ₹{p.price.toLocaleString("en-IN")}
                          {p.stock !== undefined && (
                            <span className="ml-2 px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-normal">
                              Stock: {p.stock}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveProduct(idx)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Inquiry / Notes */}
          <div className="space-y-1.5 pt-1 border-t">
            <Label htmlFor="lead-notes" className="text-xs font-medium">
              Inquiry Details / Customer Requirements
            </Label>
            <Textarea
              id="lead-notes"
              placeholder="What is the customer looking for? Note any specific preferences, budget, or questions..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-3 border-t flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
