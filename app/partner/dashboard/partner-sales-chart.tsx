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
}

export function PartnerSalesChart({ partnerId }: PartnerSalesChartProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartType, setChartType] = useState<'bar' | 'line'>('line')

  useEffect(() => {
    let mounted = true
    
    async function fetchData() {
      setIsLoading(true)
      setError(null)
      try {
        const monthStr = format(currentMonth, 'yyyy-MM-dd')
        const result = await getPartnerSalesAnalytics(partnerId, monthStr)
        
        if (!mounted) return

        if (!result.success) {
          setError(result.message || "Failed to load analytics")
          return
        }

        const rawData = result.data || []
        
        const daysInMonth = eachDayOfInterval({
          start: startOfMonth(currentMonth),
          end: endOfMonth(currentMonth)
        })

        const formattedData = daysInMonth.map(day => {
          const dayString = format(day, 'yyyy-MM-dd')
          const row = rawData.find((r: any) => r.date === dayString)
          const earningsAmount = row ? Number(row.earnings_amount) : 0
          
          return {
            date: day,
            dayStr: format(day, "d EEE"), 
            earnings: earningsAmount
          }
        })

        setData(formattedData)
      } catch (err: any) {
        if (mounted) setError(err.message || "An error occurred")
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    fetchData()
    return () => { mounted = false }
  }, [partnerId, currentMonth])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2 rounded-lg">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Earnings Trend</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {format(startOfMonth(currentMonth), 'M/d/yyyy')} - {format(endOfMonth(currentMonth), 'M/d/yyyy')}
          </div>
          <div className="flex bg-gray-50 border border-gray-100 rounded-lg p-0.5">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setChartType('bar')}
              className={`h-7 w-8 p-0 rounded-md ${chartType === 'bar' ? 'bg-white shadow-sm text-indigo-500' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setChartType('line')}
              className={`h-7 w-8 p-0 rounded-md ${chartType === 'line' ? 'bg-white shadow-sm text-indigo-500' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <TrendingUp className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
            Earnings
          </div>
        </div>
      </div>

      <div className="h-80 w-full">
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
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
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
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
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
