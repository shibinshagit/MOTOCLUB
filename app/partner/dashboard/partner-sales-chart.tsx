"use client"

import React, { useState, useEffect } from "react"
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts"
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns"
import { Loader2, TrendingUp, BarChart2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPartnerSalesAnalytics } from "@/app/actions/partner-actions"

interface PartnerSalesChartProps {
  partnerId: number
  dateRange?: string
  fromDate?: string
  toDate?: string
  initialData?: any[]
}

export function PartnerSalesChart({
  partnerId,
  dateRange = "This Month",
  fromDate = "",
  toDate = "",
  initialData = [],
}: PartnerSalesChartProps) {
  const [data, setData] = useState<any[]>(initialData)
  const [rangeBadge, setRangeBadge] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartType, setChartType] = useState<'bar' | 'line'>('line')

  useEffect(() => {
    let mounted = true
    
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const result = await getPartnerSalesAnalytics(partnerId, { dateRange, fromDate, toDate })
        
        if (!mounted) return

        if (!result.success) {
          setError(result.message || "Failed to load analytics")
          return
        }

        const rawData = result.data || []
        setData(rawData)

        if (result.startDate && result.endDate) {
          setRangeBadge(`${result.startDate} - ${result.endDate}`)
        } else {
          setRangeBadge(dateRange)
        }
      } catch (err: any) {
        if (mounted) setError(err.message || "An error occurred")
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    fetchData()
    return () => { mounted = false }
  }, [partnerId, dateRange, fromDate, toDate])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 sm:p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-indigo-50 p-2 rounded-lg shrink-0">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
          </div>
          <h2 className="text-base sm:text-xl font-bold text-gray-900 truncate">Earnings Trend</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          {rangeBadge && (
            <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full whitespace-nowrap">
              {rangeBadge}
            </div>
          )}
          <div className="flex bg-gray-50 border border-gray-100 rounded-lg p-0.5 shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setChartType('bar')}
              className={`h-7 w-8 p-0 rounded-md ${chartType === 'bar' ? 'bg-white shadow-sm text-indigo-500' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <BarChart2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setChartType('line')}
              className={`h-7 w-8 p-0 rounded-md ${chartType === 'line' ? 'bg-white shadow-sm text-indigo-500' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-gray-600 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></div>
            <span>Earnings</span>
          </div>
        </div>
      </div>

      <div className="h-64 sm:h-80 w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-500 text-sm">
            {error}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="dayStr" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  dy={10}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={(value) => `₹${value}`}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value}`, 'Earnings']}
                  labelStyle={{ color: '#64748b', fontWeight: 500, marginBottom: '4px' }}
                />
                <Bar dataKey="earnings" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="dayStr" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  dy={10}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={(value) => `₹${value}`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value}`, 'Earnings']}
                  labelStyle={{ color: '#64748b', fontWeight: 500, marginBottom: '4px' }}
                />
                <Line type="monotone" dataKey="earnings" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
