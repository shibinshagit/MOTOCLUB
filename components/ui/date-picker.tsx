"use client"

import type React from "react"

import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

export interface DatePickerProps {
  onDateChange: (date: Date | undefined) => void
  value?: Date | undefined
  className?: string
  placeholder?: string
  id?: string
}

export function DatePickerField({
  className,
  onDateChange,
  value,
  placeholder = "Pick a date",
  id,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground", className)}
          onClick={() => setOpen(true)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(newDate) => {
            onDateChange(newDate)
            setOpen(false)
          }}
          {...props}
        />
      </PopoverContent>
    </Popover>
  )
}

// Alternative simple date input for better preview compatibility
export function SimpleDateInput({ className, onDateChange, value, placeholder = "Select date", id }: DatePickerProps) {
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value
    if (dateValue) {
      const newDate = new Date(dateValue)
      if (!isNaN(newDate.getTime())) {
        onDateChange(newDate)
      }
    } else {
      onDateChange(undefined)
    }
  }

  const formatDateForInput = (date: Date | undefined) => {
    if (!date || isNaN(date.getTime())) {
      return ""
    }
    return format(date, "yyyy-MM-dd")
  }

  return (
    <input
      type="date"
      id={id}
      value={formatDateForInput(value)}
      onChange={handleDateChange}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      placeholder={placeholder}
    />
  )
}
