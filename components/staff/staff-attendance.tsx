"use client"

import React, { useState, useEffect } from "react"
import { getMyAttendance, AttendanceRecord } from "@/app/actions/attendance-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

export default function StaffAttendance() {
  const [isLoading, setIsLoading] = useState(true)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())

  const fetchAttendance = async () => {
    setIsLoading(true)
    const res = await getMyAttendance(month, year)
    if (res.success) {
      setRecords(res.data || [])
      setTodayRecord(res.today || null)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAttendance()
  }, [month, year])

  const formatTime = (val: Date | string | null) => {
    if (!val) return "-"
    return new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatHours = (minutes: number) => {
    if (!minutes) return "0h 0m"
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
  }

  const renderCalendar = () => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDay = new Date(year, month - 1, 1).getDay()
    
    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-gray-50 border border-gray-100 rounded-md"></div>)
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const record = records.find(r => {
        const d = typeof r.date === 'string' ? r.date.split("T")[0] : new Date(r.date).toISOString().split("T")[0]
        return d === dateStr
      })
      
      const isToday = new Date().toISOString().split("T")[0] === dateStr

      let bgClass = "bg-white"
      let statusIcon = null
      
      if (record) {
        if (record.status === 'Present' || (record.check_in && !record.status)) {
          bgClass = "bg-emerald-50 border-emerald-200"
          statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        } else if (record.status === 'Absent') {
          bgClass = "bg-rose-50 border-rose-200"
          statusIcon = <XCircle className="h-4 w-4 text-rose-500" />
        } else if (record.status === 'Half Day') {
          bgClass = "bg-blue-50 border-blue-200"
        } else if (record.status === 'Leave') {
          bgClass = "bg-purple-50 border-purple-200"
        } else {
          bgClass = "bg-gray-100 border-gray-200"
        }
      }

      days.push(
        <div key={i} className={`h-24 p-2 border rounded-md flex flex-col justify-between ${bgClass} ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
          <div className="flex justify-between items-start">
            <span className={`font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{i}</span>
            {statusIcon}
          </div>
          {record && (
            <div className="text-xs space-y-1">
              <div className="text-gray-600">In: {formatTime(record.check_in)}</div>
              {record.check_out && <div className="text-gray-600">Out: {formatTime(record.check_out)}</div>}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="mt-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">My Attendance</h1>
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          <div className="max-w-md">
            <Card>
              <CardHeader className="pb-4 border-b">
                <CardTitle className="text-lg font-semibold text-gray-900 flex items-center justify-between">
                  Today's Attendance
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Status</span>
                  <span className={`font-semibold flex items-center ${
                    todayRecord?.status === 'Present' || (todayRecord?.check_in && !todayRecord?.status) ? 'text-emerald-600' :
                    todayRecord?.status === 'Completed' ? 'text-emerald-600' :
                    'text-gray-900'
                  }`}>
                    {(todayRecord?.status === 'Present' || (todayRecord?.check_in && !todayRecord?.status) || todayRecord?.status === 'Completed') && <CheckCircle2 className="mr-1 h-4 w-4" />}
                    {todayRecord ? (todayRecord.status || 'Present') : 'Not Marked'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Check In</span>
                  <span className="font-semibold text-gray-900">
                    {todayRecord?.check_in ? formatTime(todayRecord.check_in) : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Check Out</span>
                  <span className="font-semibold text-gray-900">
                    {todayRecord?.check_out ? formatTime(todayRecord.check_out) : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-4 border-b">
                  <span className="text-gray-500 font-medium">Working Hours</span>
                  <span className="font-semibold text-gray-900">
                    {todayRecord?.working_minutes ? formatHours(todayRecord.working_minutes) : (todayRecord?.check_in && !todayRecord?.check_out ? 'Running...' : '0h 0m')}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Remarks</span>
                  <span className="font-semibold text-gray-900 text-right max-w-[200px] truncate">
                    {todayRecord?.remarks || '--'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Attendance Calendar</CardTitle>
                <div className="flex items-center space-x-4">
                  <button onClick={handlePrevMonth} className="text-gray-500 hover:text-gray-900">&larr;</button>
                  <span className="font-medium">{new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={handleNextMonth} className="text-gray-500 hover:text-gray-900">&rarr;</button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {renderCalendar()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
