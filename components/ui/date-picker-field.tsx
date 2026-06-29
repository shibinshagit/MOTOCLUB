"use client"

import type React from "react"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"

interface DatePickerFieldProps {
  id?: string
  label?: string
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  className?: string
}

export function DatePickerField({ id, label, date, onDateChange, className }: DatePickerFieldProps) {
  // Format the date to YYYY-MM-DD for the input
  const formatDateForInput = (date: Date | undefined) => {
    if (!date || isNaN(date.getTime())) {
      return ""
    }
    return format(date, "yyyy-MM-dd")
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value) {
      const newDate = new Date(value)
      if (!isNaN(newDate.getTime())) {
        onDateChange(newDate)
      }
    } else {
      onDateChange(undefined)
    }
  }

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input
        type="date"
        id={id}
        value={formatDateForInput(date)}
        onChange={handleDateChange}
        className="date-input-themed flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-gray-900 [color-scheme:light] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
