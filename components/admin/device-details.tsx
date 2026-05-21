"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Monitor, Package, ShoppingCart, Receipt, BarChart2, Users, DollarSign, Brain } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getProductsByDevice, getSalesByDevice, getPurchasesByDevice } from "@/app/actions/admin-actions"
import DeviceProductsTab from "./device-tabs/device-products-tab"
import DeviceSalesTab from "./device-tabs/device-sales-tab"
import DevicePurchasesTab from "./device-tabs/device-purchases-tab"
import DeviceStockTab from "./device-tabs/device-stock-tab"
import DeviceCustomersTab from "./device-tabs/device-customers-tab"
import DeviceFinanceTab from "./device-tabs/device-finance-tab"
import DeviceAnalyticsTab from "./device-tabs/device-analytics-tab"
import DeviceStaffTab from "./device-tabs/device-staff-tab"

type Device = {
  id: number
  name: string
  email: string
  company_id: number
  created_at?: string
}

interface DeviceDetailsProps {
  device: Device
  onBack: () => void
}

export default function DeviceDetails({ device, onBack }: DeviceDetailsProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [deviceStats, setDeviceStats] = useState({
    productCount: 0,
    saleCount: 0,
    purchaseCount: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchDeviceStats()
  }, [device.id])

  const fetchDeviceStats = async () => {
    setIsLoading(true)
    try {
      // Fetch product count
      const productsResult = await getProductsByDevice(device.id)
      const productCount = productsResult.success ? productsResult.data.length : 0

      // Fetch sales count
      const salesResult = await getSalesByDevice(device.id)
      const saleCount = salesResult.success ? salesResult.data.length : 0

      // Fetch purchases count
      const purchasesResult = await getPurchasesByDevice(device.id)
      const purchaseCount = purchasesResult.success ? purchasesResult.data.length : 0

      setDeviceStats({
        productCount,
        saleCount,
        purchaseCount,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load device statistics",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button
            onClick={onBack}
            variant="outline"
            className="mr-4 border-[#334155] bg-transparent text-[#94A3B8] hover:bg-[#334155] hover:text-white"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            BACK
          </Button>
          <div>
            <h2 className="font-orbitron text-2xl font-bold text-white">{device.name}</h2>
            <p className="text-[#94A3B8]">{device.email}</p>
          </div>
        </div>
      </div>

      <Card className="border-[#334155] bg-[#1E293B]">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-lg bg-[#0F172A] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Products</p>
                  <p className="text-2xl font-bold text-white">{deviceStats.productCount}</p>
                </div>
                <div className="rounded-full bg-[#334155] p-2 text-[#6366F1]">
                  <Package className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[#0F172A] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Sales</p>
                  <p className="text-2xl font-bold text-white">{deviceStats.saleCount}</p>
                </div>
                <div className="rounded-full bg-[#334155] p-2 text-[#6366F1]">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[#0F172A] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Purchases</p>
                  <p className="text-2xl font-bold text-white">{deviceStats.purchaseCount}</p>
                </div>
                <div className="rounded-full bg-[#334155] p-2 text-[#6366F1]">
                  <Receipt className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[#0F172A] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Device ID</p>
                  <p className="text-2xl font-bold text-white">#{device.id}</p>
                </div>
                <div className="rounded-full bg-[#334155] p-2 text-[#6366F1]">
                  <Monitor className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-2 gap-2 rounded-lg bg-[#1E293B] p-1 md:grid-cols-4 lg:grid-cols-8">
          <TabsTrigger
            value="overview"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <Brain className="mr-2 h-4 w-4" />
            ANALYTICS
          </TabsTrigger>
          <TabsTrigger
            value="products"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <Package className="mr-2 h-4 w-4" />
            PRODUCTS
          </TabsTrigger>
          <TabsTrigger
            value="sales"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            SALES
          </TabsTrigger>
          <TabsTrigger
            value="purchases"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <Receipt className="mr-2 h-4 w-4" />
            PURCHASES
          </TabsTrigger>
          <TabsTrigger
            value="stock"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <BarChart2 className="mr-2 h-4 w-4" />
            STOCK
          </TabsTrigger>
          <TabsTrigger
            value="customers"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <Users className="mr-2 h-4 w-4" />
            CUSTOMERS
          </TabsTrigger>
          <TabsTrigger
            value="staff"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <Users className="mr-2 h-4 w-4" />
            STAFF
          </TabsTrigger>
          <TabsTrigger
            value="finance"
            className="rounded-md data-[state=active]:bg-[#334155] data-[state=active]:text-white"
          >
            <DollarSign className="mr-2 h-4 w-4" />
            FINANCE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DeviceAnalyticsTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="products">
          <DeviceProductsTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="sales">
          <DeviceSalesTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="purchases">
          <DevicePurchasesTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="stock">
          <DeviceStockTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="customers">
          <DeviceCustomersTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="staff">
          <DeviceStaffTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="finance">
          <DeviceFinanceTab deviceId={device.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
