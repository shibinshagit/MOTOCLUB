"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  User,
  Calendar,
  Banknote,
  CreditCard,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  DollarSign,
  Briefcase,
  Phone,
  Building,
  Edit3
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  getMyAttendance,
  saveAttendanceNote,
  type AttendanceRecord
} from "@/app/actions/attendance-actions"
import {
  createStaffRequest,
  getStaffRequests,
  getStaffPurchaseDetails
} from "@/app/actions/staff-request-actions"
import { getSalaryPaymentHistory } from "@/app/actions/salary-actions"
import { useAppSelector } from "@/store/hooks"
import { selectDevice } from "@/store/slices/deviceSlice"
import { selectActiveStaff } from "@/store/slices/staffSlice"

const ITEMS_PER_PAGE = 5

export default function StaffProfileTab() {
  const { toast } = useToast()
  const device = useAppSelector(selectDevice)
  const activeStaff = useAppSelector(selectActiveStaff)
  const currency = device?.currency || "INR"

  // Active view section
  const [profileSection, setProfileSection] = useState<"attendance" | "financials">("attendance")

  // --- ATTENDANCE STATE ---
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())

  // Note Modal state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [selectedDateStr, setSelectedDateStr] = useState<string>("")
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null)
  const [noteText, setNoteText] = useState("")
  const [isSavingNote, setIsSavingNote] = useState(false)

  // --- FINANCIAL HISTORY & REQUESTS STATE ---
  const [financialTab, setFinancialTab] = useState<"salary" | "requests" | "purchases">("salary")
  
  // Salary history
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [isLoadingSalary, setIsLoadingSalary] = useState(false)
  const [salaryPage, setSalaryPage] = useState(1)

  // Requests history
  const [requests, setRequests] = useState<any[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [requestsPage, setRequestsPage] = useState(1)

  // Purchases history
  const [purchaseDetails, setPurchaseDetails] = useState<any>(null)
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false)
  const [purchasesPage, setPurchasesPage] = useState(1)

  // New Request Modal state
  const [isSubmitOpen, setIsSubmitOpen] = useState(false)
  const [requestForm, setRequestForm] = useState({
    requestType: "salary_advance" as "salary_advance" | "credit_request" | "leave_request",
    amount: 0,
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    leaveType: "Casual",
    reason: ""
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- ATTENDANCE FETCH & HELPERS ---
  const fetchAttendance = async () => {
    setIsLoadingAttendance(true)
    const res = await getMyAttendance(month, year)
    if (res.success) {
      setRecords(res.data || [])
      setTodayRecord(res.today || null)
    }
    setIsLoadingAttendance(false)
  }

  useEffect(() => {
    fetchAttendance()
  }, [month, year])

  const formatTime = (val: Date | string | null) => {
    if (!val) return "-"
    return new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const handleDayClick = (dateStr: string, record?: AttendanceRecord) => {
    setSelectedDateStr(dateStr)
    setSelectedRecord(record || null)
    setNoteText(record?.remarks || "")
    setIsNoteModalOpen(true)
  }

  const handleSaveNote = async () => {
    if (!selectedDateStr) return
    setIsSavingNote(true)
    try {
      const res = await saveAttendanceNote(selectedDateStr, noteText)
      if (res.success) {
        notifySuccess(toast, "Attendance note saved successfully", "Saved")
        setIsNoteModalOpen(false)
        fetchAttendance()
      } else {
        notifyError(toast, res.message || "Failed to save note", "Error")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "An unexpected error occurred", "Error")
    } finally {
      setIsSavingNote(false)
    }
  }

  // --- FINANCIAL HISTORY FETCHERS ---
  const fetchSalaryHistory = async () => {
    if (!device?.id) return
    setIsLoadingSalary(true)
    try {
      const res = await getSalaryPaymentHistory(device.id, activeStaff?.id)
      if (res.success) {
        setSalaryHistory(res.data || [])
      }
    } catch (err) {
      console.error("Error fetching salary history:", err)
    } finally {
      setIsLoadingSalary(false)
    }
  }

  const fetchRequests = async () => {
    if (!device?.id) return
    setIsLoadingRequests(true)
    try {
      const res = await getStaffRequests({ deviceId: device.id })
      if (res.success) {
        setRequests(res.data || [])
      }
    } catch (err) {
      console.error("Error fetching requests:", err)
    } finally {
      setIsLoadingRequests(false)
    }
  }

  const fetchPurchases = async () => {
    if (!device?.id) return
    setIsLoadingPurchases(true)
    try {
      const res = await getStaffPurchaseDetails(0, device.id)
      if (res.success) {
        setPurchaseDetails(res.data)
      }
    } catch (err) {
      console.error("Error fetching purchase details:", err)
    } finally {
      setIsLoadingPurchases(false)
    }
  }

  useEffect(() => {
    if (financialTab === "salary") fetchSalaryHistory()
    if (financialTab === "requests") fetchRequests()
    if (financialTab === "purchases") fetchPurchases()
  }, [device?.id, financialTab])

  const handleOpenSubmit = (type: "salary_advance" | "credit_request" | "leave_request") => {
    setRequestForm({
      requestType: type,
      amount: 0,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      leaveType: "Casual",
      reason: ""
    })
    setIsSubmitOpen(true)
  }

  const handleSubmitRequest = async () => {
    if (!requestForm.reason.trim()) {
      notifyError(toast, "Please enter a reason for your request", "Missing Reason")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await createStaffRequest({
        deviceId: device?.id || undefined,
        requestType: requestForm.requestType,
        amount: Number(requestForm.amount),
        startDate: requestForm.startDate,
        endDate: requestForm.endDate,
        leaveType: requestForm.leaveType,
        reason: requestForm.reason
      })

      if (res.success) {
        notifySuccess(toast, res.message, "Submitted")
        setIsSubmitOpen(false)
        fetchRequests()
      } else {
        notifyError(toast, res.message, "Error")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Failed to submit request", "Error")
    } finally {
      setIsSubmitting(false)
    }
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // --- CALENDAR RENDER (COMPACT SIZE WITH DAY CLICK NOTE OPTION) ---
  const renderCalendar = () => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDay = new Date(year, month - 1, 1).getDay()

    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-14 bg-slate-50/50 border border-slate-100 rounded-lg"></div>)
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`
      const record = records.find((r) => {
        const d = typeof r.date === "string" ? r.date.split("T")[0] : new Date(r.date).toISOString().split("T")[0]
        return d === dateStr
      })

      const isToday = new Date().toISOString().split("T")[0] === dateStr

      let bgClass = "bg-white hover:bg-slate-50 border-slate-200"
      let statusDot = null

      if (record) {
        if (record.status === "Present" || (record.check_in && !record.status)) {
          bgClass = "bg-emerald-50/90 border-emerald-300 hover:bg-emerald-100 text-emerald-900"
          statusDot = <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
        } else if (record.status === "Absent") {
          bgClass = "bg-rose-50/90 border-rose-300 hover:bg-rose-100 text-rose-900"
          statusDot = <span className="h-2 w-2 rounded-full bg-rose-500"></span>
        } else if (record.status === "Half Day") {
          bgClass = "bg-blue-50/90 border-blue-300 hover:bg-blue-100 text-blue-900"
          statusDot = <span className="h-2 w-2 rounded-full bg-blue-500"></span>
        } else if (record.status === "Leave") {
          bgClass = "bg-purple-50/90 border-purple-300 hover:bg-purple-100 text-purple-900"
          statusDot = <span className="h-2 w-2 rounded-full bg-purple-500"></span>
        }
      }

      days.push(
        <div
          key={i}
          onClick={() => handleDayClick(dateStr, record)}
          className={`h-14 p-1.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${bgClass} ${
            isToday ? "ring-2 ring-blue-600 ring-offset-1 font-bold shadow-sm" : ""
          }`}
          title={record?.remarks ? `Note: ${record.remarks}` : "Click to view/add note"}
        >
          <div className="flex justify-between items-center text-xs">
            <span className={isToday ? "text-blue-700 font-bold" : "text-slate-700 font-semibold"}>{i}</span>
            <div className="flex items-center gap-1">
              {record?.remarks && <FileText className="h-3 w-3 text-amber-600" />}
              {statusDot}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 truncate font-mono">
            {record?.check_in ? formatTime(record.check_in) : ""}
          </div>
        </div>
      )
    }

    return (
      <div className="mt-2">
        <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">{days}</div>
      </div>
    )
  }

  // --- PAGINATION HELPERS ---
  const paginate = (array: any[], page: number) => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE
    return array.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }

  const totalSalaryPages = Math.ceil(salaryHistory.length / ITEMS_PER_PAGE) || 1
  const totalRequestsPages = Math.ceil(requests.length / ITEMS_PER_PAGE) || 1
  const purchasesList = purchaseDetails?.purchases || []
  const totalPurchasesPages = Math.ceil(purchasesList.length / ITEMS_PER_PAGE) || 1

  return (
    <div className="space-y-6">
      {/* Profile Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg">
              {(activeStaff?.name || "Staff").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{activeStaff?.name || "Staff Member"}</h1>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30">
                  {activeStaff?.role || "Staff"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-300">
                {activeStaff?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-blue-400" /> {activeStaff.phone}
                  </span>
                )}
                {device?.name && (
                  <span className="flex items-center gap-1">
                    <Building className="h-3.5 w-3.5 text-emerald-400" /> {device.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant={profileSection === "attendance" ? "default" : "outline"}
              onClick={() => setProfileSection("attendance")}
              className={profileSection === "attendance" ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-700 text-slate-200 hover:bg-slate-800"}
            >
              <Calendar className="mr-2 h-4 w-4" /> Attendance & Notes
            </Button>
            <Button
              variant={profileSection === "financials" ? "default" : "outline"}
              onClick={() => setProfileSection("financials")}
              className={profileSection === "financials" ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-700 text-slate-200 hover:bg-slate-800"}
            >
              <Banknote className="mr-2 h-4 w-4" /> Financials & Requests
            </Button>
          </div>
        </div>
      </div>

      {/* SECTION 1: ATTENDANCE & CALENDAR */}
      {profileSection === "attendance" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Attendance Summary */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-4 border-b bg-slate-50/50">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center justify-between">
                <span>Today's Attendance</span>
                <Clock className="h-4 w-4 text-slate-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Status</span>
                <span
                  className={`font-semibold flex items-center ${
                    todayRecord?.status === "Present" || (todayRecord?.check_in && !todayRecord?.status) || todayRecord?.status === "Completed"
                      ? "text-emerald-600"
                      : "text-slate-900"
                  }`}
                >
                  {(todayRecord?.status === "Present" || (todayRecord?.check_in && !todayRecord?.status) || todayRecord?.status === "Completed") && (
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                  )}
                  {todayRecord ? todayRecord.status || "Present" : "Not Marked"}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Check In</span>
                <span className="font-semibold text-slate-900">{formatTime(todayRecord?.check_in || null)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Check Out</span>
                <span className="font-semibold text-slate-900">{formatTime(todayRecord?.check_out || null)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Working Hours</span>
                <span className="font-semibold text-slate-900">{formatHours(todayRecord?.working_minutes || 0)}</span>
              </div>

              <div className="flex justify-between items-start text-sm border-t pt-4">
                <span className="text-slate-500 font-medium">Remarks / Note</span>
                <span className="font-medium text-slate-700 text-right max-w-[180px] truncate">
                  {todayRecord?.remarks || "No remarks today"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Compact Attendance Calendar */}
          <Card className="lg:col-span-2 shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Attendance Calendar</CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Click any day to view or add daily notes & remarks
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-semibold text-slate-900 min-w-[110px] text-center">
                    {monthNames[month - 1]} {year}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoadingAttendance ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : (
                renderCalendar()
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SECTION 2: FINANCIAL HISTORY & REQUESTS WITH PAGINATION */}
      {profileSection === "financials" && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-4 border-b bg-slate-50/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Financial History & Requests</CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  View your salary payment slips, salary advance & credit requests, and staff purchases.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleOpenSubmit("salary_advance")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="mr-1 h-4 w-4" /> Request Salary Advance
                </Button>
                <Button size="sm" onClick={() => handleOpenSubmit("leave_request")} variant="outline">
                  <Plus className="mr-1 h-4 w-4" /> Request Leave
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs value={financialTab} onValueChange={(val: any) => setFinancialTab(val)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100">
                <TabsTrigger value="salary" className="text-xs font-semibold">
                  <Banknote className="mr-1.5 h-4 w-4 text-emerald-600" /> Salary History
                </TabsTrigger>
                <TabsTrigger value="requests" className="text-xs font-semibold">
                  <FileText className="mr-1.5 h-4 w-4 text-blue-600" /> My Requests
                </TabsTrigger>
                <TabsTrigger value="purchases" className="text-xs font-semibold">
                  <ShoppingBag className="mr-1.5 h-4 w-4 text-purple-600" /> Staff Purchases
                </TabsTrigger>
              </TabsList>

              {/* SALARY HISTORY TAB */}
              <TabsContent value="salary" className="space-y-4">
                {isLoadingSalary ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : salaryHistory.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                    <Banknote className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-800">No salary payment records found</p>
                    <p className="text-xs mt-1">Salary payments processed by admin will appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 font-semibold">Payment Type</th>
                            <th className="px-4 py-3 font-semibold text-right">Amount</th>
                            <th className="px-4 py-3 font-semibold text-center">Status</th>
                            <th className="px-4 py-3 font-semibold">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginate(salaryHistory, salaryPage).map((item: any, idx: number) => (
                            <tr key={item.id || idx} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {item.payment_date || item.created_at ? new Date(item.payment_date || item.created_at).toLocaleDateString() : "-"}
                              </td>
                              <td className="px-4 py-3 text-slate-700 capitalize">
                                {item.payment_type || item.type || "Salary"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {currency} {Number(item.amount || item.paid_amount || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                  {item.status || "Paid"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                                {item.remarks || item.notes || "Salary payout"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Salary Pagination */}
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-500">
                        Showing {Math.min((salaryPage - 1) * ITEMS_PER_PAGE + 1, salaryHistory.length)} to{" "}
                        {Math.min(salaryPage * ITEMS_PER_PAGE, salaryHistory.length)} of {salaryHistory.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={salaryPage === 1}
                          onClick={() => setSalaryPage((p) => Math.max(p - 1, 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-xs font-semibold px-2">
                          Page {salaryPage} of {totalSalaryPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={salaryPage >= totalSalaryPages}
                          onClick={() => setSalaryPage((p) => Math.min(p + 1, totalSalaryPages))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* REQUESTS TAB */}
              <TabsContent value="requests" className="space-y-4">
                {isLoadingRequests ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-800">No submitted requests</p>
                    <p className="text-xs mt-1 mb-4">Submit requests for salary advance, credit, or leave.</p>
                    <Button size="sm" onClick={() => handleOpenSubmit("salary_advance")}>
                      <Plus className="mr-1 h-4 w-4" /> Create First Request
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Date</th>
                            <th className="px-4 py-3 font-semibold">Request Type</th>
                            <th className="px-4 py-3 font-semibold text-right">Amount / Days</th>
                            <th className="px-4 py-3 font-semibold text-center">Status</th>
                            <th className="px-4 py-3 font-semibold">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginate(requests, requestsPage).map((req: any) => (
                            <tr key={req.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {new Date(req.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 capitalize font-semibold text-slate-800">
                                {req.request_type ? req.request_type.replace("_", " ") : "Request"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {req.request_type === "leave_request"
                                  ? `${req.leave_type || "Leave"}`
                                  : `${currency} ${Number(req.amount || 0).toFixed(2)}`}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge
                                  className={
                                    req.status === "Approved"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : req.status === "Rejected"
                                      ? "bg-rose-100 text-rose-800 border-rose-200"
                                      : "bg-amber-100 text-amber-800 border-amber-200"
                                  }
                                >
                                  {req.status || "Pending"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[200px]">
                                {req.reason || "No reason specified"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Requests Pagination */}
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-500">
                        Showing {Math.min((requestsPage - 1) * ITEMS_PER_PAGE + 1, requests.length)} to{" "}
                        {Math.min(requestsPage * ITEMS_PER_PAGE, requests.length)} of {requests.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={requestsPage === 1}
                          onClick={() => setRequestsPage((p) => Math.max(p - 1, 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-xs font-semibold px-2">
                          Page {requestsPage} of {totalRequestsPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={requestsPage >= totalRequestsPages}
                          onClick={() => setRequestsPage((p) => Math.min(p + 1, totalRequestsPages))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* PURCHASES TAB */}
              <TabsContent value="purchases" className="space-y-4">
                {isLoadingPurchases ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : !purchaseDetails || purchasesList.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                    <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p className="font-semibold text-slate-800">No staff purchase records found</p>
                    <p className="text-xs mt-1">Purchases billed to your staff account will be listed here.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div className="bg-slate-50 p-4 rounded-xl border">
                        <p className="text-xs text-slate-500">Total Purchase Value</p>
                        <h4 className="text-lg font-bold text-slate-900 mt-1">
                          {currency} {Number(purchaseDetails.totalPurchases || 0).toFixed(2)}
                        </h4>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-xs text-emerald-600">Total Paid</p>
                        <h4 className="text-lg font-bold text-emerald-800 mt-1">
                          {currency} {Number(purchaseDetails.totalPaid || 0).toFixed(2)}
                        </h4>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <p className="text-xs text-amber-600">Outstanding Balance</p>
                        <h4 className="text-lg font-bold text-amber-800 mt-1">
                          {currency} {Number(purchaseDetails.outstandingBalance || 0).toFixed(2)}
                        </h4>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Order / Date</th>
                            <th className="px-4 py-3 font-semibold">Item Details</th>
                            <th className="px-4 py-3 font-semibold text-right">Total Amount</th>
                            <th className="px-4 py-3 font-semibold text-right">Paid</th>
                            <th className="px-4 py-3 font-semibold text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginate(purchasesList, purchasesPage).map((pur: any) => (
                            <tr key={pur.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                <div>#{pur.tracking_id || pur.id}</div>
                                <div className="text-xs text-slate-400">
                                  {new Date(pur.created_at).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs">
                                {pur.product_names || "Staff Product Purchase"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {currency} {Number(pur.total_amount || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                {currency} {Number(pur.paid_amount || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge
                                  className={
                                    pur.payment_status === "Paid"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }
                                >
                                  {pur.payment_status || "Pending"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Purchases Pagination */}
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-500">
                        Showing {Math.min((purchasesPage - 1) * ITEMS_PER_PAGE + 1, purchasesList.length)} to{" "}
                        {Math.min(purchasesPage * ITEMS_PER_PAGE, purchasesList.length)} of {purchasesList.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={purchasesPage === 1}
                          onClick={() => setPurchasesPage((p) => Math.max(p - 1, 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-xs font-semibold px-2">
                          Page {purchasesPage} of {totalPurchasesPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={purchasesPage >= totalPurchasesPages}
                          onClick={() => setPurchasesPage((p) => Math.min(p + 1, totalPurchasesPages))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* MODAL 1: ADD/EDIT ATTENDANCE DAY NOTE */}
      <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="h-5 w-5 text-blue-600" />
              Day Note — {selectedDateStr}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add or update your remarks and notes for this date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedRecord && (
              <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Attendance Status:</span>
                  <span className="font-semibold text-slate-800">{selectedRecord.status || "Marked"}</span>
                </div>
                {selectedRecord.check_in && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Check In / Out:</span>
                    <span className="font-medium text-slate-700">
                      {formatTime(selectedRecord.check_in)} — {formatTime(selectedRecord.check_out)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Daily Remarks / Note</Label>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter remarks e.g. Worked on inventory restock, doctor visit, overtime work..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNote} disabled={isSavingNote} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSavingNote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: SUBMIT NEW REQUEST */}
      <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize text-slate-900">
              Submit {requestForm.requestType.replace("_", " ")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {requestForm.requestType !== "leave_request" ? (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Requested Amount ({currency})</Label>
                <Input
                  type="number"
                  value={requestForm.amount || ""}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: Number(e.target.value) })}
                  placeholder="e.g. 5000"
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Start Date</Label>
                    <Input
                      type="date"
                      value={requestForm.startDate}
                      onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">End Date</Label>
                    <Input
                      type="date"
                      value={requestForm.endDate}
                      onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Reason / Description</Label>
              <Textarea
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                placeholder="Explain the reason for your request..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsSubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRequest} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
