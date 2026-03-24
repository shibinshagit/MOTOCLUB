"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface Product {
  id: number
  name: string
  price: number
  stock: number
  type: "product"
}

interface Service {
  id: number
  name: string
  price: number
  cost: number
  type: "service"
}

interface Customer {
  id: number
  name: string
  phone: string
}

interface Staff {
  id: number
  name: string
}

interface SaleItem {
  id: string
  itemId: number
  name: string
  price: number
  quantity: number
  total: number
  type: "product" | "service"
}

export default function AddSalePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>("")
  const [selectedStaff, setSelectedStaff] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Mock data - replace with actual API calls
  useEffect(() => {
    // Fetch products
    setProducts([
      { id: 879, name: "PUBG TRIGGER", price: 20, stock: 10, type: "product" },
      { id: 504, name: "WHITENING CREAM", price: 65, stock: 5, type: "product" },
      { id: 464, name: "PERFUME BOX", price: 10, stock: 15, type: "product" },
    ])

    // Fetch services
    setServices([
      { id: 17, name: "display", price: 150, cost: 0, type: "service" },
      { id: 16, name: "REPAIRING", price: 30, cost: 0, type: "service" },
      { id: 15, name: "repairing phone", price: 123, cost: 0, type: "service" },
    ])

    // Fetch customers
    setCustomers([
      { id: 1, name: "Satheesh", phone: "1234567890" },
      { id: 2, name: "Arshad ch", phone: "0987654321" },
    ])

    // Fetch staff
    setStaff([
      { id: 12, name: "ALTHAF" },
      { id: 13, name: "STAFF 2" },
    ])
  }, [])

  const allItems = [...products, ...services]
  const filteredItems = allItems.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const addItem = (item: Product | Service) => {
    const existingItem = saleItems.find((si) => si.itemId === item.id && si.type === item.type)

    if (existingItem) {
      setSaleItems((prev) =>
        prev.map((si) =>
          si.id === existingItem.id ? { ...si, quantity: si.quantity + 1, total: (si.quantity + 1) * si.price } : si,
        ),
      )
    } else {
      const newItem: SaleItem = {
        id: `${item.type}-${item.id}-${Date.now()}`,
        itemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        total: item.price,
        type: item.type,
      }
      setSaleItems((prev) => [...prev, newItem])
    }
    setSearchTerm("")
  }

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId)
      return
    }

    setSaleItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity, total: quantity * item.price } : item)),
    )
  }

  const removeItem = (itemId: string) => {
    setSaleItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const calculateTotal = () => {
    return saleItems.reduce((sum, item) => sum + item.total, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (saleItems.length === 0) {
      alert("Please add at least one item to the sale")
      return
    }

    setIsLoading(true)

    try {
      // Prepare sale data
      const saleData = {
        customer_id: selectedCustomer ? Number.parseInt(selectedCustomer) : null,
        staff_id: selectedStaff ? Number.parseInt(selectedStaff) : null,
        device_id: 35, // Current device
        total_amount: calculateTotal(),
        payment_method: paymentMethod,
        status: "Completed",
        items: saleItems.map((item) => ({
          product_id: item.itemId, // This is the key - service IDs go here too
          quantity: item.quantity,
          type: item.type, // For reference, but product_id is what matters
        })),
      }

      console.log("Sale Data:", saleData)

      // Here you would call your API to create the sale
      // const response = await createSale(saleData)

      // For now, just show success
      alert("Sale created successfully!")

      // Reset form
      setSaleItems([])
      setSelectedCustomer("")
      setSelectedStaff("")
      setPaymentMethod("Cash")
    } catch (error) {
      console.error("Error creating sale:", error)
      alert("Error creating sale. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <Card className="bg-white shadow-lg rounded-2xl">
          <CardHeader className="bg-blue-600 text-white rounded-t-2xl">
            <CardTitle className="text-2xl font-bold">Add New Sale</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer and Staff Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="customer">Customer (Optional)</Label>
                  <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Walk-in Customer</SelectItem>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.name} - {customer.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="staff">Staff</Label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((member) => (
                        <SelectItem key={member.id} value={member.id.toString()}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="payment">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Item Search and Selection */}
              <div>
                <Label htmlFor="search">Search Products & Services</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search for products or services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {searchTerm && (
                  <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                    {filteredItems.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center"
                        onClick={() => addItem(item)}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant={item.type === "service" ? "default" : "secondary"}>{item.type}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            ₹{item.price.toFixed(2)}
                            {item.type === "product" && ` (Stock: ${(item as Product).stock})`}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-blue-600" />
                      </div>
                    ))}
                    {filteredItems.length === 0 && <div className="p-3 text-gray-500 text-center">No items found</div>}
                  </div>
                )}
              </div>

              {/* Sale Items */}
              {saleItems.length > 0 && (
                <div>
                  <Label>Sale Items</Label>
                  <div className="mt-2 space-y-2">
                    {saleItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant={item.type === "service" ? "default" : "secondary"}>{item.type}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">₹{item.price.toFixed(2)} each</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Label htmlFor={`qty-${item.id}`} className="text-sm">
                            Qty:
                          </Label>
                          <Input
                            id={`qty-${item.id}`}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, Number.parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </div>

                        <div className="text-right min-w-[80px]">
                          <div className="font-medium">₹{item.total.toFixed(2)}</div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              {saleItems.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total Amount:</span>
                    <span className="text-blue-600">₹{calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={isLoading || saleItems.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg transition-colors duration-300"
                >
                  {isLoading ? "Creating Sale..." : "Create Sale"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSaleItems([])
                    setSelectedCustomer("")
                    setSelectedStaff("")
                    setPaymentMethod("Cash")
                  }}
                  className="px-8 py-2 rounded-lg"
                >
                  Clear All
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
