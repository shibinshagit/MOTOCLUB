"use client"
import React, { useEffect, useCallback, useState, useMemo, useRef } from "react"
import {
  TrendingUp, DollarSign, Package, Users, AlertCircle, CheckCircle,
  ArrowUpRight, ArrowDownRight, RefreshCw, Target, BarChart3, PieChart,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart } from "@/components/ui/line-chart"
import { formatCurrencySync } from "@/lib/currency-utils"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { getComprehensiveDashboardData } from "@/app/actions/home-dashboard-actions"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import {
  selectHomeDashboardData, selectHomeDashboardLoading,
  selectHomeDashboardBackgroundLoading, selectHomeDashboardError,
  selectHomeDashboardLastUpdated, selectHomeDashboardPeriod,
  setDashboardData, setLoading, setBackgroundLoading, setError, setPeriod,
} from "@/store/slices/homeDashboardSlice"
import { selectDeviceCurrency, selectUser, selectDevice } from "@/store/slices/deviceSlice"

interface HomeTabProps {
  userId?: number
  deviceId?: number
}

// Global request deduplication cache
const requestCache = new Map<string, Promise<any>>()
const CACHE_DURATION = 30 * 1000 // 30 seconds
const requestTimestamps = new Map<string, number>()

// Custom hook with enhanced request deduplication
function useDashboardData(userId?: number, deviceId?: number, selectedPeriod?: string) {
  const dispatch = useAppDispatch()
  const deviceCurrency = useAppSelector(selectDeviceCurrency)
  const [currency, setCurrency] = useState(deviceCurrency || "INR")
  
  // Enhanced fetch state management
  const fetchStateRef = useRef({
    lastSuccessfulFetch: 0,
    consecutiveErrors: 0,
    isComponentMounted: true,
    autoRefreshInterval: null as NodeJS.Timeout | null
  })

  // Cleanup on unmount
  useEffect(() => {
    fetchStateRef.current.isComponentMounted = true
    return () => {
      fetchStateRef.current.isComponentMounted = false
      if (fetchStateRef.current.autoRefreshInterval) {
        clearInterval(fetchStateRef.current.autoRefreshInterval)
        fetchStateRef.current.autoRefreshInterval = null
      }
    }
  }, [])

  const fetchDashboardData = useCallback(async (showLoading = true, forceFetch = false) => {
    if (!userId || !deviceId) {
      const missing = []
      if (!userId) missing.push("User ID")
      if (!deviceId) missing.push("Device ID")
      dispatch(setError(`${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required`))
      dispatch(setLoading(false))
      dispatch(setBackgroundLoading(false))
      return
    }

    // Create cache key
    const cacheKey = `dashboard-${userId}-${deviceId}-${selectedPeriod}`
    const now = Date.now()
    
    // Check if we should skip this request
    if (!forceFetch) {
      // Skip if recent successful fetch (within 10 seconds)
      if (now - fetchStateRef.current.lastSuccessfulFetch < 10000) {
        console.log('⏭️ Skipping fetch - too recent')
        return
      }

      // Check cache timestamp
      const lastRequestTime = requestTimestamps.get(cacheKey) || 0
      if (now - lastRequestTime < 3000) { // 3 second minimum between requests
        console.log('⏭️ Skipping fetch - rate limited')
        return
      }
    }

    // Check for existing request in cache
    if (requestCache.has(cacheKey) && !forceFetch) {
      console.log('⏳ Using existing request promise')
      return requestCache.get(cacheKey)
    }

    // Exponential backoff for consecutive errors
    if (fetchStateRef.current.consecutiveErrors > 0 && !forceFetch) {
      const backoffTime = Math.min(1000 * Math.pow(2, fetchStateRef.current.consecutiveErrors), 30000)
      if (now - (requestTimestamps.get(cacheKey) || 0) < backoffTime) {
        console.log(`⏸️ Backing off for ${backoffTime}ms due to errors`)
        return
      }
    }

    console.log('🚀 Starting dashboard fetch:', { userId, deviceId, selectedPeriod, forceFetch })
    
    // Create and cache the request promise
    const fetchPromise = (async () => {
      try {
        // Check if component is still mounted
        if (!fetchStateRef.current.isComponentMounted) {
          console.log('⚠️ Component unmounted, aborting fetch')
          return
        }

        if (showLoading) {
          dispatch(setLoading(true))
        } else {
          dispatch(setBackgroundLoading(true))
        }

        requestTimestamps.set(cacheKey, now)

        const needsCurrencyFetch = !deviceCurrency && deviceId
        const fetches = [getComprehensiveDashboardData(userId, deviceId, selectedPeriod)]
        if (needsCurrencyFetch) {
          fetches.unshift(getDeviceCurrency(deviceId))
        }

        const results = await Promise.all(fetches)
        const [currencyRes, dataRes] = needsCurrencyFetch ? results : [null, results[0]]

        // Check if component is still mounted after async operation
        if (!fetchStateRef.current.isComponentMounted) {
          console.log('⚠️ Component unmounted during fetch, discarding results')
          return
        }

        if (currencyRes) setCurrency(currencyRes)

        if (dataRes.success && dataRes.data) {
          dispatch(setDashboardData(dataRes.data))
          dispatch(setError(null))
          fetchStateRef.current.lastSuccessfulFetch = now
          fetchStateRef.current.consecutiveErrors = 0
          console.log('✅ Dashboard fetch successful')
        } else {
          fetchStateRef.current.consecutiveErrors++
          dispatch(setError(dataRes.message || "Failed to load dashboard data"))
          console.log('❌ Dashboard fetch failed:', dataRes.message)
        }
      } catch (err) {
        fetchStateRef.current.consecutiveErrors++
        console.error("Dashboard fetch error:", err)
        if (fetchStateRef.current.isComponentMounted) {
          dispatch(setError("Failed to load dashboard data"))
        }
      } finally {
        // Remove from cache after completion
        requestCache.delete(cacheKey)
        
        if (fetchStateRef.current.isComponentMounted) {
          dispatch(setLoading(false))
          dispatch(setBackgroundLoading(false))
        }
      }
    })()

    // Cache the promise
    requestCache.set(cacheKey, fetchPromise)
    
    // Clean up cache after completion
    fetchPromise.finally(() => {
      setTimeout(() => {
        requestCache.delete(cacheKey)
      }, CACHE_DURATION)
    })

    return fetchPromise
  }, [userId, deviceId, selectedPeriod, dispatch, deviceCurrency]) // Stable dependencies

  return {
    fetchDashboardData,
    currency,
    fetchStateRef
  }
}

export default function HomeTab({ userId: propUserId, deviceId: propDeviceId }: HomeTabProps) {
  const dispatch = useAppDispatch()
  const dashboardData = useAppSelector(selectHomeDashboardData)
  const isLoading = useAppSelector(selectHomeDashboardLoading)
  const isBackgroundLoading = useAppSelector(selectHomeDashboardBackgroundLoading)
  const error = useAppSelector(selectHomeDashboardError)
  const selectedPeriod = useAppSelector(selectHomeDashboardPeriod)
  const user = useAppSelector(selectUser)
  const device = useAppSelector(selectDevice)
  const lastUpdated = useAppSelector(selectHomeDashboardLastUpdated)

  const userId = propUserId || user?.id
  const deviceId = propDeviceId || device?.id

  const { fetchDashboardData, currency, fetchStateRef } = useDashboardData(userId, deviceId, selectedPeriod)

  // Track component initialization to prevent multiple initial fetches
  const initRef = useRef({
    hasInitialized: false,
    initParams: ""
  })

  const formatCurrency = useCallback((amount: number) => {
    if (typeof amount !== "number" || isNaN(amount)) {
      return formatCurrencySync(0, currency)
    }
    return formatCurrencySync(amount, currency)
  }, [currency])

  // Single initialization effect - runs only once per unique param set
  useEffect(() => {
    const currentParams = `${userId}-${deviceId}-${selectedPeriod}`
    
    if (userId && deviceId && !initRef.current.hasInitialized) {
      console.log('🔄 Initializing dashboard data fetch')
      initRef.current.hasInitialized = true
      initRef.current.initParams = currentParams
      fetchDashboardData(true, true)
    } else if (currentParams !== initRef.current.initParams && userId && deviceId) {
      console.log('🔄 Parameters changed, refetching')
      initRef.current.initParams = currentParams
      fetchDashboardData(true, true)
    }
  }, [userId, deviceId, selectedPeriod]) // Remove fetchDashboardData from deps

  // Controlled auto-refresh effect with better cleanup
  useEffect(() => {
    // Clear any existing interval
    if (fetchStateRef.current.autoRefreshInterval) {
      clearInterval(fetchStateRef.current.autoRefreshInterval)
      fetchStateRef.current.autoRefreshInterval = null
    }

    // Only set up auto-refresh if we have data and valid params
    if (userId && deviceId && dashboardData && initRef.current.hasInitialized) {
      console.log('⏰ Setting up auto-refresh (5 minutes)')
      fetchStateRef.current.autoRefreshInterval = setInterval(() => {
        console.log('🔄 Auto-refresh triggered')
        fetchDashboardData(false, true)
      }, 5 * 60 * 1000) // 5 minutes
    }

    return () => {
      if (fetchStateRef.current.autoRefreshInterval) {
        clearInterval(fetchStateRef.current.autoRefreshInterval)
        fetchStateRef.current.autoRefreshInterval = null
      }
    }
  }, [dashboardData, userId, deviceId]) // Stable dependencies only

  const handlePeriodChange = useCallback((period: "today" | "week" | "month" | "quarter" | "year") => {
    console.log('📅 Period changed to:', period)
    dispatch(setPeriod(period))
    // Reset initialization to allow fetch with new period
    initRef.current.hasInitialized = false
  }, [dispatch])

  const handleRefresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered')
    fetchDashboardData(false, true)
  }, [fetchDashboardData])
  
  // Memoize business insights calculation
  const businessInsights = useMemo(() => {
    if (!dashboardData) return []

    const insights = []
    const { currentPeriod, previousPeriod, profitMargin, accountsReceivable, lowStockCount } = dashboardData

    // Revenue growth insight
    if (previousPeriod.revenue > 0) {
      const revenueGrowth = ((currentPeriod.revenue - previousPeriod.revenue) / previousPeriod.revenue) * 100
      if (revenueGrowth > 10) {
        insights.push({
          type: "success" as const,
          title: "Strong Revenue Growth",
          message: `Revenue increased by ${revenueGrowth.toFixed(1)}% compared to last period`,
          action: "Keep up the momentum!",
        })
      } else if (revenueGrowth < -5) {
        insights.push({
          type: "warning" as const,
          title: "Revenue Decline",
          message: `Revenue decreased by ${Math.abs(revenueGrowth).toFixed(1)}% compared to last period`,
          action: "Consider marketing strategies",
        })
      }
    }

    // Profit margin insight
    if (profitMargin > 20) {
      insights.push({
        type: "success" as const,
        title: "Healthy Profit Margin",
        message: `Your profit margin of ${profitMargin.toFixed(1)}% is excellent`,
        action: "Consider expanding operations",
      })
    } else if (profitMargin < 10) {
      insights.push({
        type: "warning" as const,
        title: "Low Profit Margin",
        message: `Profit margin of ${profitMargin.toFixed(1)}% needs improvement`,
        action: "Review pricing and costs",
      })
    }

    // Cash flow insight
    if (accountsReceivable > currentPeriod.revenue * 0.3) {
      insights.push({
        type: "info" as const,
        title: "High Receivables",
        message: "You have significant pending payments from customers",
        action: "Follow up on outstanding invoices",
      })
    }

    // Stock insight
    if (lowStockCount > 0) {
      insights.push({
        type: "warning" as const,
        title: "Stock Alert",
        message: `${lowStockCount} products are running low`,
        action: "Reorder inventory soon",
      })
    }

    return insights.slice(0, 3)
  }, [dashboardData])

  // Memoize time since update calculation
  const timeSinceUpdate = useMemo(() => {
    if (!lastUpdated) return ""
    const now = new Date()
    const updated = new Date(lastUpdated)
    const diffMs = now.getTime() - updated.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }, [lastUpdated])

  // Show error if missing required parameters
  if (!userId || !deviceId) {
    return (
      <div className="space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen p-4">
        <Alert variant="destructive" className="rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to load dashboard: {!userId && "User ID"} {!userId && !deviceId && " and "} {!deviceId && "Device ID"} missing.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Loading skeleton
  if (isLoading && !dashboardData) {
    return (
      <div className="space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Business Overview</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {lastUpdated && `Updated ${timeSinceUpdate}`}
            {isBackgroundLoading && (
              <span className="ml-2 inline-flex items-center">
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                Refreshing...
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-36 rounded-xl border-gray-200 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isBackgroundLoading}
            className="rounded-xl bg-transparent"
          >
            <RefreshCw className={`h-4 w-4 ${isBackgroundLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dashboardData && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Revenue"
              value={formatCurrency(dashboardData.totalRevenue)}
              change={
                dashboardData.previousPeriod.revenue > 0
                  ? ((dashboardData.currentPeriod.revenue - dashboardData.previousPeriod.revenue) /
                      dashboardData.previousPeriod.revenue) *
                    100
                  : 0
              }
              icon={<DollarSign className="h-6 w-6" />}
              color="green"
            />
            <MetricCard
              title="Net Profit"
              value={formatCurrency(dashboardData.netProfit)}
              change={
                dashboardData.previousPeriod.profit > 0
                  ? ((dashboardData.currentPeriod.profit - dashboardData.previousPeriod.profit) /
                      dashboardData.previousPeriod.profit) *
                    100
                  : 0
              }
              icon={<TrendingUp className="h-6 w-6" />}
              color="blue"
            />
            <MetricCard
              title="Profit Margin"
              value={`${dashboardData.profitMargin.toFixed(1)}%`}
              change={0}
              icon={<Target className="h-6 w-6" />}
              color="purple"
            />
            <MetricCard
              title="Total Products"
              value={dashboardData.totalProducts.toString()}
              change={0}
              icon={<Package className="h-6 w-6" />}
              color="orange"
            />
          </div>

          {/* Business Health & Growth Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Growth Chart */}
            <Card className="rounded-2xl shadow-sm border-0 bg-white dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                  <BarChart3 className="h-5 w-5 mr-2 text-blue-500" />
                  Revenue Growth Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <LineChart
                    data={dashboardData.cashFlowData || []}
                    height={240}
                    color="#10b981"
                    showGrid={true}
                    showDots={true}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Business Health */}
            <Card className="rounded-2xl shadow-sm border-0 bg-white dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                  <PieChart className="h-5 w-5 mr-2 text-green-500" />
                  Business Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <HealthIndicator
                  label="Cash Flow"
                  status={dashboardData.netCashFlow >= 0 ? "good" : "warning"}
                  value={formatCurrency(dashboardData.netCashFlow)}
                />
                <HealthIndicator
                  label="Profit Margin"
                  status={
                    dashboardData.profitMargin > 15 ? "good" : dashboardData.profitMargin > 5 ? "warning" : "poor"
                  }
                  value={`${dashboardData.profitMargin.toFixed(1)}%`}
                />
                <HealthIndicator
                  label="Pending Payments"
                  status={dashboardData.accountsReceivable === 0 ? "good" : "warning"}
                  value={formatCurrency(dashboardData.accountsReceivable)}
                />
                <HealthIndicator
                  label="Stock Status"
                  status={dashboardData.lowStockCount === 0 ? "good" : "warning"}
                  value={`${dashboardData.lowStockCount} items low`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Business Insights */}
          {businessInsights.length > 0 && (
            <Card className="rounded-2xl shadow-sm border-0 bg-white dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                  <Target className="h-5 w-5 mr-2 text-purple-500" />
                  Smart Business Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {businessInsights.map((insight, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border-l-4 ${
                        insight.type === "success"
                          ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                          : insight.type === "warning"
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500"
                            : "bg-blue-50 dark:bg-blue-900/20 border-blue-500"
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div
                          className={`p-1 rounded-full ${
                            insight.type === "success"
                              ? "bg-green-100 dark:bg-green-800"
                              : insight.type === "warning"
                                ? "bg-yellow-100 dark:bg-yellow-800"
                                : "bg-blue-100 dark:bg-blue-800"
                          }`}
                        >
                          {insight.type === "success" ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-white text-sm">{insight.title}</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{insight.message}</p>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mt-2">{insight.action}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickStat
              label="Customers"
              value={dashboardData.totalCustomers}
              icon={<Users className="h-5 w-5 text-blue-500" />}
            />
            <QuickStat
              label="Suppliers"
              value={dashboardData.totalSuppliers}
              icon={<Package className="h-5 w-5 text-green-500" />}
            />
            <QuickStat
              label="Low Stock"
              value={dashboardData.lowStockCount}
              icon={<AlertCircle className="h-5 w-5 text-red-500" />}
            />
            <QuickStat
              label="Overdue"
              value={dashboardData.overdueInvoices}
              icon={<AlertCircle className="h-5 w-5 text-orange-500" />}
            />
          </div>
        </>
      )}
    </div>
  )
}

// Memoized Helper Components
interface MetricCardProps {
  title: string
  value: string
  change: number
  icon: React.ReactNode
  color: "green" | "blue" | "purple" | "orange"
}

const MetricCard = React.memo(function MetricCard({ title, value, change, icon, color }: MetricCardProps) {
  const colorClasses = {
    green: "from-green-500 to-green-600",
    blue: "from-blue-500 to-blue-600", 
    purple: "from-purple-500 to-purple-600",
    orange: "from-orange-500 to-orange-600",
  }

  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-white dark:bg-gray-800 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
            {change !== 0 && (
              <div
                className={`flex items-center mt-2 text-sm ${
                  change >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {change >= 0 ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                {Math.abs(change).toFixed(1)}%
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-r ${colorClasses[color]} text-white`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
})

interface HealthIndicatorProps {
  label: string
  status: "good" | "warning" | "poor"
  value: string
}

const HealthIndicator = React.memo(function HealthIndicator({ label, status, value }: HealthIndicatorProps) {
  const statusConfig = {
    good: { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: CheckCircle },
    warning: {
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
      icon: AlertCircle,
    },
    poor: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: AlertCircle },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center space-x-3">
        <div className={`p-1 rounded-full ${config.bg}`}>
          <Icon className={`h-4 w-4 ${config.color}`} />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
    </div>
  )
})

interface QuickStatProps {
  label: string
  value: number
  icon: React.ReactNode
}

const QuickStat = React.memo(function QuickStat({ label, value, icon }: QuickStatProps) {
  return (
    <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-gray-800">
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">{icon}</div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
