"use client"

import { useEffect, useRef } from "react"

interface ChartDataPoint {
  period: string
  income: number
  expenses?: number
  netFlow?: number
}

interface LineChartProps {
  data: ChartDataPoint[]
  height?: number
  color?: string
  showGrid?: boolean
  showDots?: boolean
  currency?: string
}

export function LineChart({
  data,
  height = 200,
  color = "#10b981",
  showGrid = true,
  showDots = true,
  currency = "INR",
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return

    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

    const width = canvasRef.current.width
    const chartHeight = height - 60 // Leave space for labels and padding

    // Get income values for the chart
    const values = data.map((d) => d.income || 0)
    const maxValue = Math.max(...values, 100) // Minimum 100 to avoid flat line
    const minValue = Math.min(...values, 0)
    const valueRange = maxValue - minValue || 100

    console.log("Chart data:", data)
    console.log("Values:", values)
    console.log("Max value:", maxValue)

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount)
    }

    // Draw grid lines and y-axis labels
    if (showGrid) {
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 1
      ctx.fillStyle = "#6b7280"
      ctx.font = "10px sans-serif"
      ctx.textAlign = "right"

      for (let i = 0; i <= 4; i++) {
        const y = 30 + (chartHeight * i) / 4
        const value = maxValue - (valueRange * i) / 4

        // Draw horizontal grid line
        ctx.beginPath()
        ctx.moveTo(50, y)
        ctx.lineTo(width - 20, y)
        ctx.stroke()

        // Draw y-axis label
        ctx.fillText(formatCurrency(value), 45, y + 4)
      }
    }

    // Calculate point positions
    const pointWidth = data.length > 1 ? (width - 70) / (data.length - 1) : 0
    const points: { x: number; y: number; value: number }[] = []

    data.forEach((item, i) => {
      const x = 50 + i * pointWidth
      const normalizedValue = valueRange > 0 ? (item.income - minValue) / valueRange : 0.5
      const y = 30 + chartHeight * (1 - normalizedValue)

      points.push({ x, y, value: item.income })
    })

    // Draw the line
    if (points.length > 1) {
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      // Use smooth curves for better visual appeal
      for (let i = 1; i < points.length; i++) {
        const prevPoint = points[i - 1]
        const currentPoint = points[i]

        if (i === 1) {
          ctx.lineTo(currentPoint.x, currentPoint.y)
        } else {
          const cpx = (prevPoint.x + currentPoint.x) / 2
          ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, cpx, (prevPoint.y + currentPoint.y) / 2)
          ctx.lineTo(currentPoint.x, currentPoint.y)
        }
      }

      ctx.stroke()

      // Add gradient fill under the line
      const gradient = ctx.createLinearGradient(0, 30, 0, 30 + chartHeight)
      gradient.addColorStop(0, color + "20")
      gradient.addColorStop(1, color + "00")

      ctx.fillStyle = gradient
      ctx.lineTo(points[points.length - 1].x, 30 + chartHeight)
      ctx.lineTo(points[0].x, 30 + chartHeight)
      ctx.closePath()
      ctx.fill()
    }

    // Draw dots
    if (showDots && points.length > 0) {
      points.forEach((point) => {
        // Outer circle (white border)
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fillStyle = "#ffffff"
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()

        // Inner circle
        ctx.beginPath()
        ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()
      })
    }

    // Draw x-axis labels
    ctx.fillStyle = "#6b7280"
    ctx.font = "10px sans-serif"
    ctx.textAlign = "center"

    data.forEach((item, i) => {
      const x = 50 + i * pointWidth
      const y = 30 + chartHeight + 15

      // Rotate text for longer labels
      if (item.period.length > 3) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(item.period, 0, 0)
        ctx.restore()
      } else {
        ctx.fillText(item.period, x, y)
      }
    })

    // Draw title if there's data
    if (values.some((v) => v > 0)) {
      ctx.fillStyle = "#374151"
      ctx.font = "bold 12px sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(`Revenue: ${formatCurrency(values.reduce((a, b) => a + b, 0))}`, 50, 20)
    }
  }, [data, height, color, showGrid, showDots, currency])

  return (
    <div className="w-full">
      <canvas
        ref={canvasRef}
        width={600}
        height={height}
        className="w-full h-auto max-w-full"
        style={{ height: `${height}px` }}
      />
      {(!data || data.length === 0) && (
        <div className="flex items-center justify-center h-full text-gray-500">
          <p>No data available for the selected period</p>
        </div>
      )}
    </div>
  )
}
