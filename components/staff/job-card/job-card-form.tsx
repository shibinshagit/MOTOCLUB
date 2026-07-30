"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Trash2, CheckCircle2, User, Phone, MapPin, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useSelector } from "react-redux"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { createJobCard, updateJobCard } from "@/app/actions/job-card-actions"
import { getSaleDetails } from "@/app/actions/sale-actions"
import { getCustomerAddresses, addSecondaryCustomerAddress, setDefaultCustomerAddress } from "@/app/actions/customer-actions"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

import CustomerSelectSimple from "@/components/sales/customer-select-simple"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import { VariantSelect } from "./variant-select"
import { JobCardSuccess } from "./job-card-success"

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  productObj: any // To hold the full product object for variants
  variantId: number | null
  variantName: string
  quantity: number
  price: number // Selling price (editable, MRP)
  msp: number // Minimum Selling Price (read-only)
  costPrice: number // Cost price (read-only from inventory)
}

export function JobCardForm({ onClose, editSaleId }: { onClose?: () => void, editSaleId?: number | null }) {
  const deviceId = useSelector(selectDeviceId)
  const currency = useSelector(selectDeviceCurrency)
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    if (editSaleId) {
      loadExistingData(editSaleId)
    }
  }, [editSaleId])

  const loadExistingData = async (id: number) => {
    setIsLoading(true)
    const res = await getSaleDetails(id)
    if (res.success && res.data) {
      const sale = res.data.sale
      const items = res.data.items
      setCustomerId(sale.customer_id)
      setCustomerName(sale.customer_name_override || sale.customer_name || "")
      setCustomerPhone(sale.customer_phone_override || sale.customer_phone || "")
      setShippingCity(sale.shipping_city || "")
      setShippingDistrict(sale.shipping_district || "")
      setShippingState(sale.shipping_state || "")
      setShippingStreet(sale.shipping_street || "")
      setShippingLandmark(sale.shipping_landmark || "")
      setShippingAddressType(sale.shipping_address_type || "Home")
      setShippingPincode(sale.shipping_pincode || "")
      setShippingPhone(sale.customer_phone_override || sale.customer_phone || "")
      setCourierPaidExtra(sale.courier_paid_extra > 0 ? sale.courier_paid_extra : "")
      
      if (items && items.length > 0) {
        setProducts(items.map((item: any) => ({
          id: crypto.randomUUID(),
          productId: item.product_id,
          productName: item.service_name || item.product_name || "",
          productObj: null,
          variantId: item.product_variant_id,
          variantName: item.variant_name || "",
          quantity: item.quantity,
          price: item.price || item.wholesale_price,
          msp: item.msp || 0,
          costPrice: item.cost || item.wholesale_price || 0,
        })))
      }
    } else {
      toast({ title: "Error", description: "Failed to load Job Card data", variant: "destructive" })
    }
    setIsLoading(false)
  }

  const [successData, setSuccessData] = useState<{ saleId: number; trackingId: string } | null>(null)

  // Form State
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")

  // Shipping Address Fields
  const [shippingCity, setShippingCity] = useState("")
  const [shippingDistrict, setShippingDistrict] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingStreet, setShippingStreet] = useState("")
  const [shippingLandmark, setShippingLandmark] = useState("")
  const [shippingAddressType, setShippingAddressType] = useState("Home")
  const [shippingPincode, setShippingPincode] = useState("")
  const [shippingPhone, setShippingPhone] = useState("")
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([])

  const [isAddAddressModalOpen, setIsAddAddressModalOpen] = useState(false)
  const [isSubmittingAddress, setIsSubmittingAddress] = useState(false)
  const [newAddress, setNewAddress] = useState({
    phone: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    street: "",
    landmark: "",
    address_type: "Home",
    is_default: false
  })

  const [courierPaidExtra, setCourierPaidExtra] = useState<number | "">("")

  const [products, setProducts] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      productObj: null,
      variantId: null,
      variantName: "",
      quantity: 1,
      price: 0,
      msp: 0,
      costPrice: 0,
    }
  ])

  const addProductRow = () => {
    setProducts([
      ...products,
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        productObj: null,
        variantId: null,
        variantName: "",
        quantity: 1,
        price: 0,
        msp: 0,
        costPrice: 0,
      }
    ])
  }

  const removeProductRow = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter((p) => p.id !== id))
    } else {
      setProducts([{
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        productObj: null,
        variantId: null,
        variantName: "",
        quantity: 1,
        price: 0,
        msp: 0,
        costPrice: 0,
      }])
    }
  }

  const updateProductRow = (id: string, field: keyof ProductRow, value: any) => {
    setProducts(prev => prev.map((p) => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleProductSelect = (
    rowId: string, 
    productId: number, 
    productName: string, 
    price: number, 
    wholesalePrice?: number, 
    stock?: number, 
    productObj?: any
  ) => {
    const defaultCostPrice = productObj?.cost_price || productObj?.variants?.[0]?.cost_price || 0
    const defaultMrp = productObj?.mrp || productObj?.price || price
    const defaultMsp = productObj?.msp || productObj?.variants?.[0]?.msp || 0
    const initialPrice = productObj?.variant_id ? (productObj?.mrp || productObj?.price || price) : defaultMrp
    const initialMsp = productObj?.variant_id ? (productObj?.msp || defaultMsp) : defaultMsp
    
    setProducts(prev => prev.map((p) => {
      if (p.id === rowId) {
        // If we're hydrating an existing row (product ID matches and we already have a name),
        // we just want to inject the full product object without overwriting saved prices/variants.
        if (p.productId === productId && p.productName) {
          return {
            ...p,
            productObj: productObj || p.productObj
          }
        }
        
        return {
          ...p,
          productId,
          productName,
          productObj: productObj || p.productObj,
          price: initialPrice, // Initialize with MRP or price
          msp: initialMsp,
          costPrice: defaultCostPrice,
          variantId: productObj?.variant_id || null, // Reset variant when product changes
          variantName: "",
        }
      }
      return p
    }))
  }

  const handleSaveNewAddress = async () => {
    if (!customerId) return
    setIsSubmittingAddress(true)
    
    const res = await addSecondaryCustomerAddress(customerId, newAddress)
    if (res.success && res.data) {
      toast({ title: "Success", description: "Address added successfully." })
      
      // Refresh addresses
      const addrRes = await getCustomerAddresses(customerId)
      if (addrRes.success) {
        setCustomerAddresses(addrRes.data)
      }
      
      // Select the newly added address
      const added = res.data
      setShippingCity(added.city || "")
      setShippingDistrict(added.district || "")
      setShippingState(added.state || "")
      setShippingStreet(added.street || "")
      setShippingLandmark(added.landmark || "")
      setShippingAddressType(added.address_type || "Home")
      setShippingPincode(added.pincode || "")
      setShippingPhone(added.phone || customerPhone || "")
      
      setIsAddAddressModalOpen(false)
      setNewAddress({ phone: "", city: "", district: "", state: "", pincode: "", street: "", landmark: "", address_type: "Home", is_default: false })
    } else {
      toast({ title: "Error", description: res.message || "Failed to add address.", variant: "destructive" })
    }
    setIsSubmittingAddress(false)
  }

  const handleSetDefaultAddress = async (addressId: number) => {
    if (!customerId) return
    const res = await setDefaultCustomerAddress(customerId, addressId)
    if (res.success) {
      toast({ title: "Success", description: "Default address updated." })
      const addrRes = await getCustomerAddresses(customerId)
      if (addrRes.success) {
        setCustomerAddresses(addrRes.data)
      }
    } else {
      toast({ title: "Error", description: res.message || "Failed to update default address.", variant: "destructive" })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerName.trim()) {
      toast({ title: "Validation Error", description: "Customer Name is required", variant: "destructive" })
      return
    }

    const validProducts = products.filter(p => p.productId !== null)
    if (validProducts.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one product", variant: "destructive" })
      return
    }

    // Check if variant is selected for products that have variants
    for (const p of validProducts) {
      if (p.productObj?.has_variants && !p.variantId) {
        toast({ title: "Validation Error", description: `Please select a variant for ${p.productName}`, variant: "destructive" })
        return
      }
    }

    setIsLoading(true)

    try {
      const input = {
        customerName,
        customerPhone,
        customerId,
        shippingPhone,
        shippingCity,
        shippingDistrict,
        shippingState,
        shippingStreet,
        shippingLandmark,
        shippingAddressType,
        shippingPincode,
        courierPaidExtra: courierPaidExtra ? Number(courierPaidExtra) : undefined,
        products: validProducts.map(p => ({
          productId: p.productId!,
          productName: p.productName,
          variantId: p.variantId || undefined,
          quantity: p.quantity,
          price: p.price,
          costPrice: p.costPrice || 0,
        }))
      }

      let res;
      if (editSaleId) {
        res = await updateJobCard(editSaleId, input)
      } else {
        res = await createJobCard(input)
      }

      if (res.success && res.data) {
        setSuccessData(res.data)
        setIsSuccess(true)
        toast({ title: "Success", description: "Job Card created successfully" })
      } else {
        toast({ title: "Error", description: res.message || "Failed to create Job Card", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "An unexpected error occurred", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setCustomerId(null)
    setCustomerName("")
    setCustomerPhone("")
    setShippingCity("")
    setShippingDistrict("")
    setShippingState("")
    setShippingStreet("")
    setShippingLandmark("")
    setShippingAddressType("Home")
    setShippingPincode("")
    setShippingPhone("")
    setCustomerAddresses([])
    setCourierPaidExtra("")
    setProducts([{
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      productObj: null,
      variantId: null,
      variantName: "",
      quantity: 1,
      price: 0,
      msp: 0,
      costPrice: 0,
    }])
    setIsSuccess(false)
    setSuccessData(null)
  }

  if (isSuccess && successData) {
    return (
      <JobCardSuccess 
        trackingId={successData.trackingId} 
        saleId={successData.saleId} 
        onCreateNew={resetForm} 
      />
    )
  }

  const calculateSubtotal = () => {
    return products.reduce((sum, p) => sum + (p.price * p.quantity), 0)
  }

  if (isLoading && editSaleId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 min-h-[50vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium text-slate-500">Loading Job Card data...</p>
      </div>
    )
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{editSaleId ? "Edit Job Card" : "Create Job Card"}</h1>
        <p className="text-muted-foreground text-sm">Internal order {editSaleId ? "editing" : "creation"} screen without inventory/accounting updates</p>
      </div>

      <div className="space-y-6">
        {/* Customer Checkout Style Details */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="border-b bg-gray-50/50 py-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900">
              <User className="h-4 w-4 text-gray-500" /> Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Select Existing Customer (Optional)</Label>
              <CustomerSelectSimple
                value={customerId}
                initialCustomerName={customerName}
                onChange={async (id, name, customerObj) => {
                  setCustomerId(id)
                  setCustomerName(name)
                  if (customerObj) {
                    setCustomerPhone(customerObj.phone || "")
                    
                    if (id) {
                      const addrRes = await getCustomerAddresses(id)
                      if (addrRes.success && addrRes.data.length > 0) {
                        setCustomerAddresses(addrRes.data)
                        const defaultAddr = addrRes.data.find((a: any) => a.is_default) || addrRes.data[0]
                        setShippingCity(defaultAddr.city || "")
                        setShippingDistrict(defaultAddr.district || "")
                        setShippingState(defaultAddr.state || "")
                        setShippingStreet(defaultAddr.street || "")
                        setShippingLandmark(defaultAddr.landmark || "")
                        setShippingAddressType(defaultAddr.address_type || "Home")
                        setShippingPincode(defaultAddr.pincode || "")
                        setShippingPhone(defaultAddr.phone || customerObj.phone || "")
                        return
                      }
                    }
                    
                    setCustomerAddresses([])
                    setShippingCity(customerObj.city || "")
                    setShippingDistrict(customerObj.district || "")
                    setShippingState(customerObj.state || "")
                    setShippingStreet(customerObj.street || "")
                    setShippingLandmark(customerObj.landmark || "")
                    setShippingAddressType(customerObj.address_type || "Home")
                    setShippingPincode(customerObj.pincode || "")
                    setShippingPhone(customerObj.phone || "")
                  } else {
                    setCustomerAddresses([])
                  }
                }}
                onAddNew={() => {}}
                userId={deviceId || 1}
                showAddNewButton={false}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Full Name <span className="text-red-500">*</span></Label>
                <Input 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)} 
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                  <Phone className="h-3 w-3 text-gray-400" /> Phone Number
                </Label>
                <Input 
                  value={customerPhone} 
                  onChange={(e) => setCustomerPhone(e.target.value)} 
                  placeholder="e.g. +971501234567"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shipping Address - Checkout Style */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="border-b bg-gray-50/50 py-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-900">
              <MapPin className="h-4 w-4 text-gray-500" /> Shipping Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {customerId && (
              <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-gray-700">Saved Addresses</Label>
                </div>
                
                {customerAddresses.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {customerAddresses.map((addr: any) => {
                      const isSelected = 
                        shippingCity === (addr.city || "") && 
                        shippingStreet === (addr.street || "") &&
                        shippingPincode === (addr.pincode || "")
                      
                      return (
                        <div 
                          key={addr.id}
                          onClick={() => {
                            setShippingCity(addr.city || "")
                            setShippingDistrict(addr.district || "")
                            setShippingState(addr.state || "")
                            setShippingStreet(addr.street || "")
                            setShippingLandmark(addr.landmark || "")
                            setShippingAddressType(addr.address_type || "Home")
                            setShippingPincode(addr.pincode || "")
                            setShippingPhone(addr.phone || customerPhone || "")
                          }}
                          className={`relative cursor-pointer border rounded-md p-3 text-left transition-all hover:border-gray-400 min-w-[200px] ${
                            isSelected ? "border-black ring-1 ring-black bg-white" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm text-gray-900 flex items-center gap-1">
                              {addr.address_type || "Address"}
                              {addr.is_default && <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded-sm ml-2">Default</span>}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 space-y-0.5">
                            <p className="truncate max-w-[180px]">{addr.street}</p>
                            <p>{addr.city}{addr.pincode ? `, ${addr.pincode}` : ""}</p>
                            <p className="flex items-center gap-1 mt-1"><Phone className="h-3 w-3" /> {addr.phone || customerPhone}</p>
                          </div>
                          
                          {!addr.is_default && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSetDefaultAddress(addr.id)
                              }}
                              className="text-[10px] text-gray-400 hover:text-black mt-2 underline block"
                            >
                              Set as Default
                            </button>
                          )}
                        </div>
                      )
                    })}
                    
                    <button
                      type="button"
                      onClick={() => setIsAddAddressModalOpen(true)}
                      className="border border-dashed border-gray-300 rounded-md p-3 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors min-w-[150px]"
                    >
                      <Plus className="h-5 w-5 mb-1" />
                      <span className="text-xs font-medium">Add Secondary<br/>Address</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 py-2">
                    No saved addresses yet.
                    <button
                      type="button"
                      onClick={() => setIsAddAddressModalOpen(true)}
                      className="ml-3 text-sm font-medium text-black hover:underline inline-flex items-center"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Address
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <div className="mb-4">
              <Label className="text-sm font-semibold text-gray-700">Selected Address Details</Label>
            </div>

            <div className="space-y-1 mb-4">
              <Label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Phone className="h-3 w-3 text-gray-400" /> Phone Number <span className="text-red-500">*</span>
              </Label>
              <Input 
                value={shippingPhone} 
                onChange={(e) => setShippingPhone(e.target.value)} 
                placeholder="e.g. +971501234567"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Location / City</Label>
                <Input 
                  value={shippingCity} 
                  onChange={(e) => setShippingCity(e.target.value)} 
                  placeholder="e.g. Dubai"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Pincode / ZIP</Label>
                <Input 
                  value={shippingPincode} 
                  onChange={(e) => setShippingPincode(e.target.value)} 
                  placeholder="e.g. 00000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">District</Label>
                <Input 
                  value={shippingDistrict} 
                  onChange={(e) => setShippingDistrict(e.target.value)} 
                  placeholder="e.g. Deira"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">State / Region</Label>
                <Input 
                  value={shippingState} 
                  onChange={(e) => setShippingState(e.target.value)} 
                  placeholder="e.g. Dubai"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">Street / Building / Area</Label>
              <Input 
                value={shippingStreet} 
                onChange={(e) => setShippingStreet(e.target.value)} 
                placeholder="e.g. Flat 302, Sheikh Zayed Rd"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Landmark</Label>
                <Input 
                  value={shippingLandmark} 
                  onChange={(e) => setShippingLandmark(e.target.value)} 
                  placeholder="e.g. Near Mall of Emirates"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Address Type</Label>
                <Select value={shippingAddressType} onValueChange={setShippingAddressType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Address Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Home">Home</SelectItem>
                    <SelectItem value="Work">Work</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Section */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4">
          <CardTitle className="text-base font-semibold text-gray-900">Product Line Items</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          
          <div className="rounded-md border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                <tr>
                  <th className="p-3 text-left w-[40%]">Product Search</th>
                  <th className="p-3 text-left w-[20%]">Variant</th>
                  <th className="p-3 text-right w-[10%]">Qty</th>
                  <th className="p-3 text-right w-[15%]">MSP</th>
                  <th className="p-3 text-right w-[15%]">MRP</th>
                  <th className="p-3 text-right w-[15%]">Total</th>
                  <th className="p-3 w-[50px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/30">
                    <td className="p-2">
                      <ProductSelectSimple
                        value={product.productId}
                        initialProductName={product.productName}
                        onChange={(id, name, price, ws, stock, obj) => handleProductSelect(product.id, id, name, price, ws, stock, obj)}
                        onAddNew={() => {}}
                        userId={deviceId || 1}
                        usePriceType="retail"
                        hideServiceIcon={true}
                      />
                    </td>
                    <td className="p-2">
                      <VariantSelect
                        variants={product.productObj?.variants || []}
                        value={product.variantId || undefined}
                        onChange={(vId, vName) => {
                          updateProductRow(product.id, "variantId", vId)
                          updateProductRow(product.id, "variantName", vName)
                          
                          const variant = product.productObj?.variants?.find((v: any) => v.id === vId)
                          if (variant) {
                            if (variant.mrp || variant.price) {
                              updateProductRow(product.id, "price", Number(variant.mrp || variant.price))
                            }
                            if (variant.msp !== undefined) {
                              updateProductRow(product.id, "msp", Number(variant.msp))
                            }
                            if (variant.cost_price) {
                              updateProductRow(product.id, "costPrice", Number(variant.cost_price))
                            }
                          }
                        }}
                        disabled={!product.productId}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="1"
                        value={product.quantity}
                        onChange={(e) => updateProductRow(product.id, "quantity", parseInt(e.target.value) || 1)}
                        className="text-right w-full"
                      />
                    </td>
                    <td className="p-2 text-right font-medium text-gray-700">
                      {currency} {(parseFloat(String(product.msp || 0))).toFixed(2)}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.price}
                        onChange={(e) => updateProductRow(product.id, "price", parseFloat(e.target.value) || 0)}
                        className="text-right w-full"
                      />
                    </td>
                    <td className="p-2 text-right font-medium text-gray-900">
                      {currency} {(parseFloat(String(product.price || 0)) * product.quantity).toFixed(2)}
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductRow(product.id)}
                        className="text-gray-400 hover:text-red-600 hover:bg-red-50/50 h-8 w-8 rounded-md"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="button" variant="outline" onClick={addProductRow} className="w-full border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50/50">
            <Plus className="h-4 w-4 mr-2 text-gray-500" /> Add Product Row
          </Button>

          {/* Totals */}
          <div className="flex justify-end pt-2">
            <div className="w-full max-w-xs space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Courier Paid (Extra)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">
                    {currency}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={courierPaidExtra}
                    onChange={(e) => setCourierPaidExtra(e.target.value === "" ? "" : Number(e.target.value))}
                    className="pl-12 text-right border-gray-200 focus-visible:ring-gray-300"
                  />
                </div>
              </div>
              <div className="h-px bg-gray-200 w-full" />
              <div className="flex justify-between font-bold text-gray-900 text-base">
                <span>Estimated Total:</span>
                <span>{currency} {(calculateSubtotal() + (Number(courierPaidExtra) || 0)).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
        </CardContent>
      </Card>

      {/* Footer / Submit */}
      <div className="flex justify-end gap-4">
        {onClose && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-600 border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </Button>
        )}
        <Button 
          type="button" 
          variant="ghost" 
          onClick={resetForm}
          disabled={isLoading}
          className="text-gray-500 hover:text-gray-700"
        >
          Reset
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          disabled={isLoading}
          className="min-w-[180px] shadow-sm"
        >
          {isLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
          ) : (
            <><CheckCircle2 className="mr-2 h-4 w-4" /> Create Job Card</>
          )}
        </Button>
      </div>

    </form>

    <Dialog open={isAddAddressModalOpen} onOpenChange={setIsAddAddressModalOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Secondary Address</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700 flex items-center gap-1">
              <Phone className="h-3 w-3 text-gray-400" /> Phone Number <span className="text-red-500">*</span>
            </Label>
            <Input 
              value={newAddress.phone} 
              onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })} 
              placeholder="e.g. +971501234567"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">Location / City <span className="text-red-500">*</span></Label>
              <Input 
                value={newAddress.city} 
                onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} 
                placeholder="e.g. Dubai"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">Pincode / ZIP</Label>
              <Input 
                value={newAddress.pincode} 
                onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })} 
                placeholder="e.g. 00000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">District</Label>
              <Input 
                value={newAddress.district} 
                onChange={(e) => setNewAddress({ ...newAddress, district: e.target.value })} 
                placeholder="e.g. Deira"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">State / Region</Label>
              <Input 
                value={newAddress.state} 
                onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })} 
                placeholder="e.g. Dubai"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-700">Street / Building / Area</Label>
            <Input 
              value={newAddress.street} 
              onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })} 
              placeholder="e.g. Flat 302, Sheikh Zayed Rd"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">Landmark</Label>
              <Input 
                value={newAddress.landmark} 
                onChange={(e) => setNewAddress({ ...newAddress, landmark: e.target.value })} 
                placeholder="e.g. Near Metro Station"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-700">Address Type</Label>
              <Select 
                value={newAddress.address_type} 
                onValueChange={(v) => setNewAddress({ ...newAddress, address_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Work">Work</SelectItem>
                  <SelectItem value="Office">Office</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-2 border-t">
            <input 
              type="checkbox" 
              id="is_default_new"
              checked={newAddress.is_default}
              onChange={(e) => setNewAddress({ ...newAddress, is_default: e.target.checked })}
              className="rounded border-gray-300"
            />
            <Label htmlFor="is_default_new" className="text-sm cursor-pointer">Make this default address</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAddAddressModalOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveNewAddress}
            disabled={isSubmittingAddress || !newAddress.phone || !newAddress.city}
          >
            {isSubmittingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
