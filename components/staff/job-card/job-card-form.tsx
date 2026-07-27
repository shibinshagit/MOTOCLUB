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
import { createJobCard } from "@/app/actions/job-card-actions"

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
  price: number // Selling price (editable)
  costPrice: number // Cost price (read-only from inventory)
}

export function JobCardForm() {
  const deviceId = useSelector(selectDeviceId)
  const currency = useSelector(selectDeviceCurrency)
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [successData, setSuccessData] = useState<{ saleId: number; trackingId: string } | null>(null)

  // Form State
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")

  // Shipping Address Fields
  const [shippingCity, setShippingCity] = useState("")
  const [shippingStreet, setShippingStreet] = useState("")
  const [shippingLandmark, setShippingLandmark] = useState("")
  const [shippingAddressType, setShippingAddressType] = useState("Home")
  const [shippingPincode, setShippingPincode] = useState("")

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
    setProducts(prev => prev.map((p) => {
      if (p.id === rowId) {
        return {
          ...p,
          productId,
          productName,
          productObj: productObj || p.productObj,
          price: productObj?.variant_id ? (productObj?.price || price) : price, // Initialize with product default price
          costPrice: defaultCostPrice,
          variantId: productObj?.variant_id || null, // Reset variant when product changes
          variantName: "",
        }
      }
      return p
    }))
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
        shippingCity,
        shippingStreet,
        shippingLandmark,
        shippingAddressType,
        shippingPincode,
        products: validProducts.map(p => ({
          productId: p.productId!,
          productName: p.productName,
          variantId: p.variantId || undefined,
          quantity: p.quantity,
          price: p.price,
          costPrice: p.costPrice || 0,
        }))
      }

      const res = await createJobCard(input)

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
    setShippingStreet("")
    setShippingLandmark("")
    setShippingAddressType("Home")
    setShippingPincode("")
    setProducts([{
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      productObj: null,
      variantId: null,
      variantName: "",
      quantity: 1,
      price: 0,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create Job Card</h1>
        <p className="text-muted-foreground text-sm">Internal order creation screen without inventory/accounting updates</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                onChange={(id, name, customerObj) => {
                  setCustomerId(id)
                  setCustomerName(name)
                  if (customerObj) {
                    setCustomerPhone(customerObj.phone || "")
                    setShippingCity(customerObj.city || "")
                    setShippingStreet(customerObj.street || "")
                    setShippingLandmark(customerObj.landmark || "")
                    setShippingAddressType(customerObj.address_type || "Home")
                    setShippingPincode(customerObj.pincode || "")
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
                  <th className="p-3 text-left w-[35%]">Product Search</th>
                  <th className="p-3 text-left w-[20%]">Variant</th>
                  <th className="p-3 text-right w-[10%]">Qty</th>
                  <th className="p-3 text-right w-[15%]">Cost Price</th>
                  <th className="p-3 text-right w-[15%]">Selling Price</th>
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
                        onChange={(id, name, price, ws, stock, obj) => handleProductSelect(product.id, id, name, price, ws, stock, obj)}
                        onAddNew={() => {}}
                        userId={deviceId || 1}
                        usePriceType="retail"
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
                            if (variant.price) {
                              updateProductRow(product.id, "price", Number(variant.price))
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
                    <td className="p-2">
                      <Input
                        type="number"
                        readOnly
                        value={parseFloat(String(product.costPrice || 0)).toFixed(2)}
                        className="text-right w-full bg-gray-50 text-gray-500 cursor-not-allowed border-gray-200"
                      />
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
            <div className="w-full max-w-xs space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex justify-between font-bold text-gray-900 text-base">
                <span>Estimated Total:</span>
                <span>{currency} {calculateSubtotal().toFixed(2)}</span>
              </div>
            </div>
          </div>
          
        </CardContent>
      </Card>

      {/* Footer / Submit */}
      <div className="flex justify-end gap-4">
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
  )
}
