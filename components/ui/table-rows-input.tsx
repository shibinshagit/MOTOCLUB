"use client"

import React, { useState, useEffect, useRef } from "react"

export interface TableRowsInputProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  label?: string
  className?: string
}

export function TableRowsInput({
  value,
  onChange,
  disabled = false,
  min = 1,
  max = 1000,
  label = "Rows:",
  className = "",
}: TableRowsInputProps) {
  const [inputValue, setInputValue] = useState<string>(String(value || 25))
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Synchronize internal input value whenever external value changes
  useEffect(() => {
    setInputValue(String(value || 25))
  }, [value])

  const commitValue = (valStr: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    const parsed = parseInt(valStr, 10)
    if (isNaN(parsed) || parsed < min) {
      setInputValue(String(value || 25))
      return
    }

    const clamped = Math.min(parsed, max)
    setInputValue(String(clamped))
    if (clamped !== value) {
      onChange(clamped)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= min) {
      const clamped = Math.min(parsed, max)
      debounceTimerRef.current = setTimeout(() => {
        if (clamped !== value) {
          onChange(clamped)
        }
      }, 500)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.currentTarget.blur()
      commitValue(inputValue)
    }
  }

  const handleBlur = () => {
    commitValue(inputValue)
  }

  return (
    <div className={`flex items-center gap-1.5 mr-1 ${className}`}>
      {label ? (
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{label}</span>
      ) : null}
      <input
        type="number"
        min={min}
        max={max}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Number of rows per page"
        className="h-8 w-14 rounded border border-slate-200 bg-white px-1.5 text-center text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none"
        title={`Number of rows (${min}-${max})`}
      />
    </div>
  )
}
