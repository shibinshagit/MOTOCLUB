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
  ResponsiveContainer,
  Legend
} from "recharts"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns"
import { ChevronLeft, ChevronRight, BarChart2, LineChart as LineChartIcon, Loader2, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getStaffSalesAnalytics } from "@/app/actions/job-card-actions"

interface StaffSalesChartProps {
  deviceId: number
  currency: string
  onSummaryUpdate?: (totals: { sales: number; orders: number }) => void
}

export function StaffSalesChart({ deviceId, currency = "INR", onSummaryUpdate }: StaffSalesChartProps) {
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
        const result = await getStaffSalesAnalytics(deviceId, monthStr)
        
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
          // Find matching row from DB using safe string matching
          const dayString = format(day, 'yyyy-MM-dd')
          const row = rawData.find((r: any) => r.date === dayString)
          const salesAmount = row ? Number(row.sales_amount) : 0
          const orderCount = row ? Number(row.order_count) : 0
          
          totalSales += salesAmount
          totalOrders += orderCount

          return {
            date: dayString,
            dayStr: format(day, "d EEE"), // e.g., "3 Fri"
            salesAmount,
            orderCount,
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
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl text-sm min-w-[120px]">
          <p className="font-semibold text-gray-900 mb-2">{data.dayStr}</p>
          <div className="flex flex-col gap-1">
            <p className="text-blue-600 font-semibold text-[13px]">
              Sales : {formatCurrency(data.salesAmount)}
            </p>
            <p className="text-slate-500 text-xs">
              Orders : {data.orderCount}
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  const hasData = useMemo(() => data.some(d => d.orderCount > 0), [data])

  return (
    <Card className="w-full border-0 shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-6 gap-4 bg-white">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-lg font-bold text-slate-800">Sales Trend</CardTitle>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 w-full sm:w-auto">
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
          <div className="flex items-center gap-2 bg-slate-50 rounded-full border border-slate-200 p-1">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-6 w-6 rounded-full hover:bg-white hover:shadow-sm">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[11px] font-semibold text-slate-600 min-w-[120px] text-center">
              {format(startOfMonth(currentMonth), "M/d/yyyy")} - {format(endOfMonth(currentMonth), "M/d/yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-6 w-6 rounded-full hover:bg-white hover:shadow-sm">
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {isLoading ? (
          <div className="h-[300px] sm:h-[350px] w-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="h-[300px] sm:h-[350px] w-full flex items-center justify-center text-red-500">
            {error}
          </div>
        ) : !hasData ? (
          <div className="h-[300px] sm:h-[350px] w-full flex items-center justify-center text-gray-500">
            No orders for this period
          </div>
        ) : (
          <div className="h-[300px] sm:h-[350px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <RechartsBarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="dayStr" 
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                    dy={10}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis 
                    tickFormatter={(val) => `₹${val}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                    width={50}
                    dx={-5}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                  <Legend 
                    verticalAlign="top" 
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 500, color: '#475569' }}
                  />
                  <Bar dataKey="salesAmount" name="Sales Amount" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </RechartsBarChart>
              ) : (
                <RechartsLineChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="dayStr" 
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                    dy={10}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis 
                    tickFormatter={(val) => `₹${val}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                    width={50}
                    dx={-5}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 500, color: '#475569' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="salesAmount" 
                    name="Sales Amount"
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
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
