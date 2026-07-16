"use client"

import React, { useState, useEffect } from "react"
import { useAppSelector } from "@/store/hooks"
import { selectDevice } from "@/store/slices/deviceSlice"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { FormAlert } from "@/components/ui/form-alert"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getFilteredAttendance, updateAttendanceStatus, AttendanceRecord } from "@/app/actions/attendance-actions"
import { Search, Loader2, Calendar as CalendarIcon, Clock, Edit2, Download, Printer, Filter, UserCircle } from "lucide-react"

export default function AttendanceTab() {
  const device = useAppSelector(selectDevice)
  const activeStaff = useAppSelector(selectActiveStaff)
  
  // Filters
  const [dateRange, setDateRange] = useState("Today")
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split("T")[0])
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split("T")[0])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  
  const [isLoading, setIsLoading] = useState(true)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState({
    total: 0,
    present: 0,
    notCheckedIn: 0,
    absent: 0,
    late: 0,
    leave: 0
  })

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)
  const [editCheckIn, setEditCheckIn] = useState("")
  const [editCheckOut, setEditCheckOut] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [editRemarks, setEditRemarks] = useState("")
  const [editError, setEditError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const getDateRangeValues = () => {
    const today = new Date()
    let start = today
    let end = today
    
    if (dateRange === "Today") {
      start = today
      end = today
    } else if (dateRange === "Yesterday") {
      start = new Date(today)
      start.setDate(today.getDate() - 1)
      end = new Date(start)
    } else if (dateRange === "This Week") {
      const first = today.getDate() - today.getDay()
      start = new Date(today.setDate(first))
      end = new Date(today.setDate(first + 6))
    } else if (dateRange === "This Month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1)
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    } else if (dateRange === "Custom Date") {
      return { start: customStartDate, end: customEndDate }
    }
    
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0]
    }
  }

  const fetchAttendance = async () => {
    if (!device?.id) return
    setIsLoading(true)
    
    const { start, end } = getDateRangeValues()
    
    const res = await getFilteredAttendance(device.id, {
      startDate: start,
      endDate: end,
      status: statusFilter
    })
    
    if (res.success && res.data) {
      setAttendance(res.data)
      setSummary(res.summary as any)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAttendance()
  }, [device?.id, dateRange, customStartDate, customEndDate, statusFilter, activeStaff?.id])

  const handleEditClick = (record: AttendanceRecord) => {
    setEditingRecord(record)
    const formatDateTime = (val: Date | string | null) => {
      if (!val) return ""
      const d = new Date(val)
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    }
    
    // Auto-populate for "Not Marked"
    if (!record.status && !record.check_in) {
      setEditStatus("Present")
      setEditCheckIn(formatDateTime(new Date()))
      setEditCheckOut("")
      setEditRemarks("")
    } else {
      setEditCheckIn(formatDateTime(record.check_in))
      setEditCheckOut(formatDateTime(record.check_out))
      setEditStatus(record.status || "Present")
      setEditRemarks(record.remarks || "")
    }
    
    setEditError("")
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!device?.id || !editingRecord) return
    setIsSaving(true)
    setEditError("")
    
    const toUTCString = (val: string) => {
      if (!val) return null
      return new Date(val).toISOString()
    }
    
    const dateStr = typeof editingRecord.date === 'string' ? editingRecord.date.split("T")[0] : new Date(editingRecord.date).toISOString().split("T")[0]

    const res = await updateAttendanceStatus(
      editingRecord.id || 0,
      editingRecord.staff_id,
      device.id,
      editingRecord.company_id || device.company?.id || null,
      dateStr,
      {
        check_in: toUTCString(editCheckIn),
        check_out: toUTCString(editCheckOut),
        status: editStatus,
        remarks: editRemarks
      }
    )

    if (res.success) {
      setEditModalOpen(false)
      fetchAttendance()
    } else {
      setEditError(res.message || "Failed to update attendance")
    }
    setIsSaving(false)
  }

  const filteredAttendance = attendance.filter(a => {
    const matchesSearch = (a.staff_name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (a.staff_phone || "").includes(searchTerm)
    return matchesSearch
  })

  const formatTime = (val: Date | string | null) => {
    if (!val) return "-"
    return new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  const formatDate = (val: Date | string | null) => {
    if (!val) return "-"
    return new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatHours = (minutes: number) => {
    if (!minutes) return "-"
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  const exportToExcel = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Staff Name,Phone,Role,Branch,Check In,Check Out,Working Hours,Late Minutes,Status,Remarks\n";

    filteredAttendance.forEach(function(record) {
      const row = [
        formatDate(record.date),
        record.staff_name || "",
        record.staff_phone || "",
        (record as any).branch_name || "",
        formatTime(record.check_in),
        formatTime(record.check_out),
        formatHours(record.working_minutes),
        record.late_minutes || 0,
        record.status || (record.check_in ? 'Present' : 'Absent'),
        (record.remarks || "").replace(/,/g, " ") // avoid comma collisions
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${dateRange.replace(" ", "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  const handlePrint = () => {
    window.print()
  }

  if (!device?.id) {
    return <FormAlert type="error" title="Error" message="Device not found." />
  }

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <h2 className="text-2xl font-semibold text-gray-900">Attendance Management</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Today">Today</SelectItem>
              <SelectItem value="Yesterday">Yesterday</SelectItem>
              <SelectItem value="This Week">This Week</SelectItem>
              <SelectItem value="This Month">This Month</SelectItem>
              <SelectItem value="Custom Date">Custom Date</SelectItem>
            </SelectContent>
          </Select>
          
          {dateRange === "Custom Date" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-[140px]" />
              <span>to</span>
              <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-[140px]" />
            </div>
          )}
          
          <Button onClick={fetchAttendance} variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:hidden">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-gray-500">Total Staff</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{summary.total || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-emerald-600">Present</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-emerald-700">{summary.present || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-gray-600">Not Checked In</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-gray-700">{summary.notCheckedIn || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-rose-600">Absent</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-rose-700">{summary.absent || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-purple-600">Leave</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-purple-700">{summary.leave || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-amber-600">Late</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-amber-700">{summary.late || 0}</div></CardContent></Card>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="print:hidden">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <CardTitle>Attendance List</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input type="text" placeholder="Search staff..." className="pl-9 w-[180px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Statuses</SelectItem>
                  <SelectItem value="Present">Present</SelectItem>
                  <SelectItem value="Absent">Absent</SelectItem>
                  <SelectItem value="Half Day">Half Day</SelectItem>
                  <SelectItem value="Leave">Leave</SelectItem>
                  <SelectItem value="Holiday">Holiday</SelectItem>
                  <SelectItem value="Week Off">Week Off</SelectItem>
                  <SelectItem value="Late">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="print:p-0">
          <div className="hidden print:block mb-4 text-center">
            <h2 className="text-xl font-bold">Attendance Report</h2>
            <p className="text-gray-500">{dateRange === "Custom Date" ? `${customStartDate} to ${customEndDate}` : dateRange}</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
          ) : filteredAttendance.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No attendance records found for the selected criteria.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto print:border-none">
              <table className="w-full text-sm text-left print:text-xs">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 print:bg-white print:border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Photo</th>
                    <th className="px-4 py-3 font-medium">Staff Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Check In</th>
                    <th className="px-4 py-3 font-medium">Check Out</th>
                    <th className="px-4 py-3 font-medium">Working Hrs</th>
                    <th className="px-4 py-3 font-medium">Remarks</th>
                    <th className="px-4 py-3 font-medium text-right print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y print:divide-gray-200">
                  {filteredAttendance.map((record) => (
                    <tr key={`${record.staff_id}-${record.date}`} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="px-4 py-3">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                          <UserCircle className="h-6 w-6" />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{record.staff_name}</td>
                      <td className="px-4 py-3 text-gray-600">{record.staff_phone}</td>
                      <td className="px-4 py-3 text-gray-600">{(record as any).branch_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium print:border print:bg-transparent ${
                          record.status === 'Present' || (record.check_in && !record.status) ? 'bg-emerald-100 text-emerald-800 print:text-emerald-800' :
                          record.status === 'Absent' ? 'bg-rose-100 text-rose-800 print:text-rose-800' :
                          record.status === 'Half Day' ? 'bg-blue-100 text-blue-800 print:text-blue-800' :
                          record.status === 'Leave' ? 'bg-purple-100 text-purple-800 print:text-purple-800' :
                          record.status === 'Holiday' ? 'bg-amber-100 text-amber-800 print:text-amber-800' :
                          record.status === 'Week Off' ? 'bg-slate-100 text-slate-800 print:text-slate-800' :
                          'bg-gray-100 text-gray-800 print:text-gray-800'
                        }`}>
                          {record.status || (record.check_in ? 'Present' : 'Not Marked')}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatTime(record.check_in)}</td>
                      <td className="px-4 py-3">{formatTime(record.check_out)}</td>
                      <td className="px-4 py-3">{formatHours(record.working_minutes)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate print:whitespace-normal">
                        {record.remarks || "-"}
                      </td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(record)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 mb-2">
              <Label>Quick Status</Label>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={editStatus === "Present" ? "default" : "outline"} onClick={() => setEditStatus("Present")} className={editStatus === "Present" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>Present</Button>
                <Button size="sm" variant={editStatus === "Absent" ? "default" : "outline"} onClick={() => setEditStatus("Absent")} className={editStatus === "Absent" ? "bg-rose-600 hover:bg-rose-700" : ""}>Absent</Button>
                <Button size="sm" variant={editStatus === "Half Day" ? "default" : "outline"} onClick={() => setEditStatus("Half Day")} className={editStatus === "Half Day" ? "bg-blue-600 hover:bg-blue-700" : ""}>Half Day</Button>
                <Button size="sm" variant={editStatus === "Leave" ? "default" : "outline"} onClick={() => setEditStatus("Leave")} className={editStatus === "Leave" ? "bg-purple-600 hover:bg-purple-700" : ""}>Leave</Button>
                <Button size="sm" variant={editStatus === "Holiday" ? "default" : "outline"} onClick={() => setEditStatus("Holiday")}>Holiday</Button>
                <Button size="sm" variant={editStatus === "Week Off" ? "default" : "outline"} onClick={() => setEditStatus("Week Off")}>Week Off</Button>
                <Button size="sm" variant={editStatus === "Late" ? "default" : "outline"} onClick={() => setEditStatus("Late")}>Late</Button>
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Present">Present</SelectItem>
                  <SelectItem value="Absent">Absent</SelectItem>
                  <SelectItem value="Half Day">Half Day</SelectItem>
                  <SelectItem value="Leave">Leave</SelectItem>
                  <SelectItem value="Holiday">Holiday</SelectItem>
                  <SelectItem value="Week Off">Week Off</SelectItem>
                  <SelectItem value="Late">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Check In Time</Label>
                <Input type="datetime-local" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Check Out Time</Label>
                <Input type="datetime-local" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} placeholder="E.g., Forgot to check out, system issue..." />
            </div>
            {editError && <p className="text-sm text-red-500 font-medium">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
