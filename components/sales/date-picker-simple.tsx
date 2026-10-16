"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerSimpleProps {
  date: Date
  onDateChange: (date: Date) => void
}

export default function DatePickerSimple({ date, onDateChange }: DatePickerSimpleProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-left font-normal" onClick={() => setOpen(true)}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            if (newDate) {
              const now = new Date()
              const existingHasTime =
                date &&
                !isNaN(date.getTime()) &&
                !(date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0)
              const hours = existingHasTime ? date.getHours() : now.getHours()
              const minutes = existingHasTime ? date.getMinutes() : now.getMinutes()
              const seconds = existingHasTime ? date.getSeconds() : now.getSeconds()
              const merged = new Date(
                newDate.getFullYear(),
                newDate.getMonth(),
                newDate.getDate(),
                hours,
                minutes,
                seconds
              )
              onDateChange(merged)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
