"use client"

import React, { useState, useEffect, useMemo } from "react"
import { 
  BarChart as RechartsBarChart, 
  Bar, 
  LineChart as RechartsLineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns"
import { ChevronLeft, ChevronRight, BarChart2, LineChart as LineChartIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getStaffSalesAnalytics } from "@/app/actions/job-card-actions"

interface StaffSalesChartProps {
  currency: string
  onSummaryUpdate?: (totals: { sales: number; orders: number }) => void
}

export function StaffSalesChart({ currency = "INR", onSummaryUpdate }: StaffSalesChartProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [chartType, setChartType] = useState<"bar" | "line">("bar")
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const monthStr = format(currentMonth, 'yyyy-MM-dd')
        const result = await getStaffSalesAnalytics(monthStr)
        
        if (!mounted) return

        if (!result.success) {
          setError(result.message || "Failed to load analytics")
          return
        }

        const rawData = result.data || []
        
        // Generate continuous days for the current month
        const daysInMonth = eachDayOfInterval({
          start: startOfMonth(currentMonth),
          end: endOfMonth(currentMonth)
        })

        let totalSales = 0
        let totalOrders = 0

        const formattedData = daysInMonth.map(day => {
          // Find matching row from DB
          const row = rawData.find((r: any) => isSameDay(parseISO(r.date), day))
          const salesAmount = row ? Number(row.sales_amount) : 0
          const orderCount = row ? Number(row.order_count) : 0
          
          totalSales += salesAmount
          totalOrders += orderCount

          return {
            date: day,
            dayStr: format(day, "d MMM"), // e.g., "14 Jul"
            salesAmount,
            orderCount
          }
        })

        setData(formattedData)
        if (onSummaryUpdate) {
          onSummaryUpdate({ sales: totalSales, orders: totalOrders })
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "An error occurred")
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, [currentMonth, onSummaryUpdate])

  const nextMonth = () => setCurrentMonth(prev => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() + 1, 1)))
  const prevMonth = () => setCurrentMonth(prev => startOfMonth(new Date(prev.getFullYear(), prev.getMonth() - 1, 1)))

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val)
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg text-sm">
          <p className="font-semibold text-gray-900 mb-1">{data.dayStr}</p>
          <p className="text-gray-700">
            Sales: <span className="font-medium">{formatCurrency(data.salesAmount)}</span>
          </p>
          <p className="text-gray-700">
            Orders: <span className="font-medium">{data.orderCount}</span>
          </p>
        </div>
      )
    }
    return null
  }

  const hasData = useMemo(() => data.some(d => d.orderCount > 0), [data])

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-6 gap-4">
        <CardTitle className="text-xl font-semibold text-gray-800">Sales Orders Trend</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-md p-1">
            <Button
              variant={chartType === "bar" ? "default" : "ghost"}
              size="sm"
              onClick={() => setChartType("bar")}
              className={`h-8 px-3 ${chartType === "bar" ? "shadow-sm" : ""}`}
            >
              <BarChart2 className="w-4 h-4 mr-2" />
              Bar
            </Button>
            <Button
              variant={chartType === "line" ? "default" : "ghost"}
              size="sm"
              onClick={() => setChartType("line")}
              className={`h-8 px-3 ${chartType === "line" ? "shadow-sm" : ""}`}
            >
              <LineChartIcon className="w-4 h-4 mr-2" />
              Line
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[100px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[350px] w-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="h-[350px] w-full flex items-center justify-center text-red-500">
            {error}
          </div>
        ) : !hasData ? (
          <div className="h-[350px] w-full flex items-center justify-center text-gray-500">
            No sales orders for this period
          </div>
        ) : (
          <div className="h-[350px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <RechartsBarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => format(val, 'd')}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    tickFormatter={(val) => formatCurrency(val)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                  <Bar dataKey="salesAmount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              ) : (
                <RechartsLineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => format(val, 'd')}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    tickFormatter={(val) => formatCurrency(val)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="salesAmount" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 6, strokeWidth: 0, fill: "#2563eb" }}
                  />
                </RechartsLineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
