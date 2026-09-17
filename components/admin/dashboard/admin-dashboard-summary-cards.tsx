"use client"

import {
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Receipt,
  PiggyBank,
  Wallet,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  PackageCheck,
  Info,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DashboardMetric, MetricCardValue } from "@/app/actions/admin-dashboard-actions"

interface AdminDashboardSummaryCardsProps {
  cards: {
    totalSales: MetricCardValue
    totalProfit: MetricCardValue & { currentGross: number; currentNet: number }
    totalExpenses: MetricCardValue
    totalCogs: MetricCardValue
    totalProductsSold: MetricCardValue
    totalOrders: MetricCardValue
  }
  currency: string
  activeMetric: DashboardMetric
  onSelectMetric: (metric: DashboardMetric) => void
  onOpenBreakdown?: () => void
  onOpenProfitBreakdown?: () => void
  onOpenExpenseBreakdown?: () => void
}

function formatAmount(value: number, currency: string): string {
  if (!Number.isFinite(value)) {
    return `${currency === "INR" || !currency ? "₹" : currency} 0`
  }
  const rounded = Math.round(value)
  const isNegative = rounded < 0
  const absFormatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded))

  const symbol = currency === "INR" || !currency ? "₹" : `${currency} `
  return isNegative ? `-${symbol}${absFormatted}` : `${symbol}${absFormatted}`
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return new Intl.NumberFormat("en-IN").format(value)
}

export default function AdminDashboardSummaryCards({
  cards,
  currency,
  activeMetric,
  onSelectMetric,
  onOpenBreakdown,
  onOpenProfitBreakdown,
  onOpenExpenseBreakdown,
}: AdminDashboardSummaryCardsProps) {
  const isFiltered = (cards.totalProfit as any).isFiltered

  const cardItems: Array<{
    id: DashboardMetric
    label: string
    value: string
    prevValue: string
    metric: MetricCardValue
    icon: any
    subLabel?: string
    color: string
  }> = [
    {
      id: "sales",
      label: "Total Sales",
      value: formatAmount(cards.totalSales.current, currency),
      prevValue: formatAmount(cards.totalSales.previous, currency),
      metric: cards.totalSales,
      icon: CircleDollarSign,
      color: "text-blue-600 bg-blue-50 border-blue-200",
    },
    {
      id: "profit",
      label: "Total Profit",
      value: formatAmount(cards.totalProfit.currentGross, currency),
      prevValue: formatAmount(
        (cards.totalProfit as any).previousGross ?? cards.totalProfit.previous,
        currency
      ),
      metric: cards.totalProfit,
      icon: PiggyBank,
      subLabel: isFiltered
        ? "Gross profit (filtered sales)"
        : `Net: ${formatAmount(cards.totalProfit.currentNet, currency)} after exp.`,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    {
      id: "expenses",
      label: "Total Expenses",
      value: formatAmount(cards.totalExpenses.current, currency),
      prevValue: formatAmount(cards.totalExpenses.previous, currency),
      metric: cards.totalExpenses,
      icon: Wallet,
      color: "text-rose-600 bg-rose-50 border-rose-200",
    },
    {
      id: "cogs",
      label: "Cost of Goods Sold",
      value: formatAmount(cards.totalCogs.current, currency),
      prevValue: formatAmount(cards.totalCogs.previous, currency),
      metric: cards.totalCogs,
      icon: Receipt,
      subLabel: "Sold inventory cost",
      color: "text-amber-600 bg-amber-50 border-amber-200",
    },
    {
      id: "quantity",
      label: "Products Sold",
      value: formatCount(cards.totalProductsSold.current),
      prevValue: formatCount(cards.totalProductsSold.previous),
      metric: cards.totalProductsSold,
      icon: PackageCheck,
      color: "text-violet-600 bg-violet-50 border-violet-200",
    },
    {
      id: "orders",
      label: "Total Orders",
      value: formatCount(cards.totalOrders.current),
      prevValue: formatCount(cards.totalOrders.previous),
      metric: cards.totalOrders,
      icon: ShoppingBag,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {cardItems.map((item) => {
        const isActive = activeMetric === item.id
        const Icon = item.icon
        const isUp = item.metric.isIncrease
        const isGood = item.metric.isPositiveDirection ? isUp : !isUp
        const isBreakdownEligible = item.id === "sales" || item.id === "orders"

        return (
          <Card
            key={item.id}
            onClick={() => onSelectMetric(item.id)}
            className={cn(
              "cursor-pointer transition-all duration-200 hover:shadow-md border bg-white relative overflow-hidden group",
              isActive
                ? "border-violet-600 ring-2 ring-violet-500/20 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            {/* Active Pill Indicator */}
            {isActive && (
              <div className="absolute top-0 inset-x-0 h-1 bg-violet-600" />
            )}

            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] sm:text-xs font-medium text-gray-500 truncate">
                    {item.label}
                  </span>
                  {item.id === "profit" && onOpenProfitBreakdown ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenProfitBreakdown()
                      }}
                      title="View profit breakdown"
                      className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  ) : item.id === "expenses" && onOpenExpenseBreakdown ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenExpenseBreakdown()
                      }}
                      title="View expense breakdown"
                      className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  ) : isBreakdownEligible && onOpenBreakdown ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenBreakdown()
                      }}
                      title="View sales breakdown"
                      className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <div className={cn("p-1.5 rounded-lg shrink-0", item.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

              {/* Main Metric Value */}
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-bold tracking-tight text-gray-900 truncate">
                  {item.value}
                </span>

                {item.subLabel ? (
                  <span className="text-[10px] text-gray-400 font-medium truncate mt-0.5">
                    {item.subLabel}
                  </span>
                ) : null}
              </div>

              {/* Difference & Previous Period Row */}
              <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2 text-[10px] sm:text-[11px]">
                <div
                  className={cn(
                    "inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md",
                    isGood
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  )}
                >
                  {isUp ? (
                    <ArrowUpRight className="h-3 w-3 shrink-0" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 shrink-0" />
                  )}
                  <span>{item.metric.diffPercent}%</span>
                </div>

                <span className="text-gray-400 truncate max-w-[80px] sm:max-w-[100px]" title={`Previous: ${item.prevValue}`}>
                  vs {item.prevValue}
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
