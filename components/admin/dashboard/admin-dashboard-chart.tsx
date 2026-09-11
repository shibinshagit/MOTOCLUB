"use client"

import { useMemo } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { DashboardMetric, ChartDataPoint } from "@/app/actions/admin-dashboard-actions"

interface AdminDashboardChartProps {
  data: ChartDataPoint[]
  metric: DashboardMetric
  currency: string
  periodLabel: string
  comparisonLabel: string
}

const METRIC_LABELS: Record<DashboardMetric, { title: string; description: string; yAxisType: "currency" | "number" }> = {
  sales: {
    title: "Sales Comparison",
    description: "Valid sales comparison between current and previous period",
    yAxisType: "currency",
  },
  profit: {
    title: "Gross Profit Comparison",
    description: "Gross sales margin (Sales - Cost of Goods Sold) comparison",
    yAxisType: "currency",
  },
  expenses: {
    title: "Expenses Comparison",
    description: "Operating debit expenses comparison",
    yAxisType: "currency",
  },
  cogs: {
    title: "Cost of Goods Sold (COGS) Comparison",
    description: "Cost corresponding to sold products and batches",
    yAxisType: "currency",
  },
  quantity: {
    title: "Products Sold Quantity Comparison",
    description: "Total units sold comparison",
    yAxisType: "number",
  },
  orders: {
    title: "Order Count Comparison",
    description: "Total completed sales/orders comparison",
    yAxisType: "number",
  },
}

function formatValue(value: number, type: "currency" | "number", currency: string) {
  if (!Number.isFinite(value)) return "0"
  if (type === "currency") {
    const isNeg = value < 0
    const absVal = Math.abs(value)
    const sym = currency === "INR" || !currency ? "₹" : `${currency} `
    if (absVal >= 100000) {
      return `${isNeg ? "-" : ""}${sym}${(absVal / 1000).toFixed(0)}k`
    }
    return `${isNeg ? "-" : ""}${sym}${new Intl.NumberFormat("en-IN").format(Math.round(absVal))}`
  }
  return new Intl.NumberFormat("en-IN").format(value)
}

export default function AdminDashboardChart({
  data,
  metric,
  currency,
  periodLabel,
  comparisonLabel,
}: AdminDashboardChartProps) {
  const metricInfo = METRIC_LABELS[metric] || METRIC_LABELS.sales

  const formattedTooltip = useMemo(() => {
    return ({ active, payload }: any) => {
      if (!active || !payload || !payload.length) return null

      const pt: ChartDataPoint = payload[0].payload
      const isCurrency = metricInfo.yAxisType === "currency"

      const currValFormatted = isCurrency
        ? formatValue(pt.currentVal, "currency", currency)
        : `${new Intl.NumberFormat("en-IN").format(pt.currentVal)} units`

      const prevValFormatted = isCurrency
        ? formatValue(pt.previousVal, "currency", currency)
        : `${new Intl.NumberFormat("en-IN").format(pt.previousVal)} units`

      const diff = pt.currentVal - pt.previousVal
      const diffPercent =
        pt.previousVal === 0
          ? pt.currentVal > 0
            ? 100
            : 0
          : Math.round(((pt.currentVal - pt.previousVal) / Math.abs(pt.previousVal)) * 100 * 10) / 10

      return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-xs space-y-2 min-w-[200px]">
          <div className="border-b border-gray-100 pb-1.5 font-semibold text-gray-900">
            {pt.label}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                <span className="text-gray-600">Current ({pt.currentDate})</span>
              </div>
              <span className="font-bold text-gray-900">{currValFormatted}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                <span className="text-gray-500">Previous ({pt.previousDate})</span>
              </div>
              <span className="font-medium text-gray-700">{prevValFormatted}</span>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1 text-[11px]">
              <span className="text-gray-400">Difference</span>
              <span
                className={`font-semibold ${
                  diff >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {diff >= 0 ? `+${diffPercent}%` : `${diffPercent}%`}
              </span>
            </div>
          </div>
        </div>
      )
    }
  }, [metricInfo.yAxisType, currency])

  return (
    <Card className="border-gray-200 bg-white shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b border-gray-100 pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900">
              {metricInfo.title}
            </CardTitle>
            <CardDescription className="text-xs text-gray-500 mt-0.5">
              {metricInfo.description}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-medium text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              <span>Current: {periodLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-400" />
              <span>Previous: {comparisonLabel}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-2 sm:p-4 pt-4 sm:pt-6">
        <div className="h-[280px] sm:h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            >
              <defs>
                <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="previousGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                tick={{ fill: "#64748b", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={20}
              />

              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(val) =>
                  formatValue(val, metricInfo.yAxisType, currency)
                }
              />

              <Tooltip content={formattedTooltip} />

              <Area
                type="monotone"
                dataKey="currentVal"
                name="Current Period"
                stroke="#7c3aed"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#currentGradient)"
              />

              <Area
                type="monotone"
                dataKey="previousVal"
                name="Previous Period"
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#previousGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
