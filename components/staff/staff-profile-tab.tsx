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
  const [selectedPurchaseForAudit, setSelectedPurchaseForAudit] = useState<any>(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)

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
      const res = await getStaffPurchaseDetails(activeStaff?.id || 0, device.id)
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
      days.push(<div key={`empty-${i}`} className="h-10 sm:h-14 bg-slate-50/50 border border-slate-100 rounded-lg"></div>)
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
          statusDot = <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-500"></span>
        } else if (record.status === "Absent") {
          bgClass = "bg-rose-50/90 border-rose-300 hover:bg-rose-100 text-rose-900"
          statusDot = <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-rose-500"></span>
        } else if (record.status === "Half Day") {
          bgClass = "bg-blue-50/90 border-blue-300 hover:bg-blue-100 text-blue-900"
          statusDot = <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-blue-500"></span>
        } else if (record.status === "Leave") {
          bgClass = "bg-purple-50/90 border-purple-300 hover:bg-purple-100 text-purple-900"
          statusDot = <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-purple-500"></span>
        }
      }

      days.push(
        <div
          key={i}
          onClick={() => handleDayClick(dateStr, record)}
          className={`h-10 sm:h-14 p-1 sm:p-1.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${bgClass} ${
            isToday ? "ring-2 ring-blue-600 ring-offset-1 font-bold shadow-sm" : ""
          }`}
          title={record?.remarks ? `Note: ${record.remarks}` : "Click to view/add note"}
        >
          <div className="flex justify-between items-center text-[10px] sm:text-xs">
            <span className={isToday ? "text-blue-700 font-bold" : "text-slate-700 font-semibold"}>{i}</span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {record?.remarks && <FileText className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-600" />}
              {statusDot}
            </div>
          </div>

          <div className="text-[8px] sm:text-[10px] text-slate-500 truncate font-mono">
            {record?.check_in ? formatTime(record.check_in) : ""}
          </div>
        </div>
      )
    }

    return (
      <div className="mt-2">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[9px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">{days}</div>
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
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-6 shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl sm:text-2xl font-black shadow-lg shrink-0">
              {(activeStaff?.name || "Staff").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate max-w-[180px] sm:max-w-none">{activeStaff?.name || "Staff Member"}</h1>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-xs shrink-0">
                  {activeStaff?.role || "Staff"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300">
                {activeStaff?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-blue-400 shrink-0" /> {activeStaff.phone}
                  </span>
                )}
                {device?.name && (
                  <span className="flex items-center gap-1">
                    <Building className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> {device.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full sm:w-auto">
            <Button
              type="button"
              onClick={() => setProfileSection("attendance")}
              className={
                profileSection === "attendance"
                  ? "bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm px-3 py-2.5 w-full justify-center shadow-md border border-blue-500/50"
                  : "bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-medium text-xs sm:text-sm px-3 py-2.5 w-full justify-center transition-all"
              }
            >
              <Calendar className="mr-2 h-4 w-4 text-emerald-400 shrink-0" /> Attendance & Notes
            </Button>
            <Button
              type="button"
              onClick={() => setProfileSection("financials")}
              className={
                profileSection === "financials"
                  ? "bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm px-3 py-2.5 w-full justify-center shadow-md border border-blue-500/50"
                  : "bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-medium text-xs sm:text-sm px-3 py-2.5 w-full justify-center transition-all"
              }
            >
              <Banknote className="mr-2 h-4 w-4 text-blue-400 shrink-0" /> Financials & Requests
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
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Financial History & Requests</CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  View your salary payment slips, salary advance & credit requests, and staff purchases.
                </CardDescription>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                <Button size="sm" onClick={() => handleOpenSubmit("salary_advance")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full justify-center">
                  <Plus className="mr-1 h-3.5 w-3.5 shrink-0" /> Request Salary Advance
                </Button>
                <Button size="sm" onClick={() => handleOpenSubmit("credit_request")} className="bg-purple-600 hover:bg-purple-700 text-white text-xs w-full justify-center">
                  <Plus className="mr-1 h-3.5 w-3.5 shrink-0" /> Request Staff Purchase
                </Button>
                <Button size="sm" onClick={() => handleOpenSubmit("leave_request")} variant="outline" className="text-xs w-full justify-center">
                  <Plus className="mr-1 h-3.5 w-3.5 shrink-0" /> Request Leave
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs value={financialTab} onValueChange={(val: any) => setFinancialTab(val)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100 p-1 h-auto">
                <TabsTrigger value="salary" className="text-[11px] sm:text-xs font-semibold py-2 px-1 sm:px-3 flex items-center justify-center gap-1">
                  <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Salary<span className="hidden sm:inline"> History</span></span>
                </TabsTrigger>
                <TabsTrigger value="requests" className="text-[11px] sm:text-xs font-semibold py-2 px-1 sm:px-3 flex items-center justify-center gap-1">
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 shrink-0" />
                  <span className="truncate"><span className="hidden sm:inline">My </span>Requests</span>
                </TabsTrigger>
                <TabsTrigger value="purchases" className="text-[11px] sm:text-xs font-semibold py-2 px-1 sm:px-3 flex items-center justify-center gap-1">
                  <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-600 shrink-0" />
                  <span className="truncate"><span className="hidden sm:inline">Staff </span>Purchases</span>
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
                    {/* MOBILE CARD LIST VIEW (< md) */}
                    <div className="block md:hidden space-y-3">
                      {paginate(salaryHistory, salaryPage).map((item: any, idx: number) => (
                        <div key={item.id || idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {item.payment_date || item.created_at ? new Date(item.payment_date || item.created_at).toLocaleDateString() : "-"}
                            </span>
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                              {item.status || "Paid"}
                            </Badge>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Payment Type</span>
                              <span className="text-xs font-medium text-slate-700 capitalize">
                                {item.payment_type || item.type || "Salary Payout"}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase block">Amount Paid</span>
                              <span className="text-sm font-bold text-slate-900">
                                {currency} {Number(item.amount || item.paid_amount || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {item.remarks && (
                            <p className="text-xs text-slate-500 italic">
                              Remarks: {item.remarks || item.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* DESKTOP TABLE VIEW (>= md) */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full min-w-[550px] text-sm text-left">
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
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-center sm:text-left">
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
                    {/* MOBILE CARD LIST VIEW (< md) */}
                    <div className="block md:hidden space-y-3">
                      {paginate(requests, requestsPage).map((req: any) => (
                        <div key={req.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {new Date(req.created_at).toLocaleDateString()}
                              </span>
                              <h4 className="font-semibold text-slate-900 text-sm mt-0.5">
                                {req.request_type === "credit_request"
                                  ? "Staff Purchase Request"
                                  : req.request_type === "salary_advance"
                                  ? "Salary Advance"
                                  : req.request_type === "leave_request"
                                  ? `Leave Request (${req.leave_type || "Casual"})`
                                  : (req.request_type || "")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                              </h4>
                            </div>
                            <Badge
                              className={
                                req.status === "Approved"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"
                                  : req.status === "Rejected"
                                  ? "bg-rose-100 text-rose-800 border-rose-200 text-[10px]"
                                  : "bg-amber-100 text-amber-800 border-amber-200 text-[10px]"
                              }
                            >
                              {req.status || "Pending"}
                            </Badge>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-500 font-medium">Requested Value</span>
                            <span className="text-sm font-bold text-slate-900">
                              {req.request_type === "leave_request"
                                ? `${req.leave_type || "Leave"}`
                                : `${currency} ${Number(req.amount || 0).toFixed(2)}`}
                            </span>
                          </div>

                          {req.reason && (
                            <div className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">Reason: </span>
                              {req.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* DESKTOP TABLE VIEW (>= md) */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full min-w-[600px] text-sm text-left">
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
                              <td className="px-4 py-3 font-semibold text-slate-800">
                                {req.request_type === "credit_request"
                                  ? "Staff Purchase Request"
                                  : req.request_type === "salary_advance"
                                  ? "Salary Advance"
                                  : req.request_type === "leave_request"
                                  ? `Leave Request (${req.leave_type || "Casual"})`
                                  : (req.request_type || "")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c: string) => c.toUpperCase())}
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
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-center sm:text-left">
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
                  <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed flex flex-col items-center justify-center">
                    <ShoppingBag className="h-10 w-10 mx-auto mb-2 text-purple-400 opacity-80" />
                    <p className="font-semibold text-slate-800 text-base">No staff purchase records found</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">Purchases billed to your staff account will be listed here.</p>
                    <Button
                      size="sm"
                      onClick={() => handleOpenSubmit("credit_request")}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Request Staff Purchase
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-200">
                        <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Total Purchase Value</p>
                        <h4 className="text-sm sm:text-lg font-bold text-slate-900 mt-1">
                          {currency} {Number(purchaseDetails?.totalPurchases || 0).toFixed(2)}
                        </h4>
                      </div>
                      <div className="bg-blue-50 p-3 sm:p-3.5 rounded-xl border border-blue-100">
                        <p className="text-[10px] sm:text-[11px] text-blue-600 font-semibold uppercase tracking-wider">Direct Paid</p>
                        <h4 className="text-sm sm:text-lg font-bold text-blue-800 mt-1">
                          {currency} {Number(purchaseDetails?.directPaid || 0).toFixed(2)}
                        </h4>
                      </div>
                      <div className="bg-purple-50 p-3 sm:p-3.5 rounded-xl border border-purple-100">
                        <p className="text-[10px] sm:text-[11px] text-purple-600 font-semibold uppercase tracking-wider">Salary Deducted</p>
                        <h4 className="text-sm sm:text-lg font-bold text-purple-800 mt-1">
                          {currency} {Number(purchaseDetails?.salaryDeducted || 0).toFixed(2)}
                        </h4>
                      </div>
                      <div className="bg-amber-50 p-3 sm:p-3.5 rounded-xl border border-amber-200">
                        <p className="text-[10px] sm:text-[11px] text-amber-700 font-semibold uppercase tracking-wider">Outstanding Balance</p>
                        <h4 className="text-sm sm:text-lg font-bold text-amber-900 mt-1">
                          {currency} {Number(purchaseDetails?.outstandingBalance || 0).toFixed(2)}
                        </h4>
                      </div>
                    </div>

                    {/* MOBILE CARD LIST VIEW (< md) */}
                    <div className="block md:hidden space-y-3">
                      {paginate(purchasesList, purchasesPage).map((pur: any) => (
                        <div key={pur.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-600 text-sm">#{pur.tracking_id || pur.id}</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(pur.created_at || pur.sale_date).toLocaleDateString()}
                              </span>
                            </div>
                            <Badge
                              className={
                                pur.payment_status === "Paid"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"
                                  : pur.payment_status === "Partially Paid"
                                  ? "bg-blue-100 text-blue-800 border-blue-200 text-[10px]"
                                  : "bg-amber-100 text-amber-800 border-amber-200 text-[10px]"
                              }
                            >
                              {pur.payment_status || "Pending"}
                            </Badge>
                          </div>

                          <div className="text-xs text-slate-700 font-medium line-clamp-2">
                            📦 {pur.product_names || "Staff Product Purchase"}
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total</span>
                              <span className="font-bold text-slate-900">
                                {currency} {Number(pur.total_amount || 0).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-blue-600 block font-semibold uppercase">Direct Paid</span>
                              <span className="font-semibold text-blue-800">
                                {currency} {Number(pur.direct_paid || 0).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-purple-600 block font-semibold uppercase">Salary Deducted</span>
                              <span className="font-semibold text-purple-800">
                                {currency} {Number(pur.salary_deducted || 0).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-amber-700 block font-semibold uppercase">Outstanding</span>
                              <span className="font-bold text-amber-900">
                                {currency} {Number(pur.outstanding_amount || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-slate-200 text-slate-700 hover:bg-slate-100"
                              onClick={() => {
                                setSelectedPurchaseForAudit(pur)
                                setIsAuditModalOpen(true)
                              }}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1 text-slate-500" /> History
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* DESKTOP TABLE VIEW (>= md) */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full min-w-[700px] text-sm text-left border-collapse">
                        <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase border-b font-semibold">
                          <tr>
                            <th className="px-4 py-3">Order / Date</th>
                            <th className="px-4 py-3">Item Details</th>
                            <th className="px-4 py-3 text-right">Purchase Total</th>
                            <th className="px-4 py-3 text-right">Direct Paid</th>
                            <th className="px-4 py-3 text-right">Salary Deducted</th>
                            <th className="px-4 py-3 text-right">Outstanding</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginate(purchasesList, purchasesPage).map((pur: any) => (
                            <tr key={pur.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                <div className="font-bold text-blue-600">#{pur.tracking_id || pur.id}</div>
                                <div className="text-xs text-slate-400">
                                  {new Date(pur.created_at || pur.sale_date).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs max-w-[180px] truncate" title={pur.product_names}>
                                {pur.product_names || "Staff Product Purchase"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">
                                {currency} {Number(pur.total_amount || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-blue-700 text-xs">
                                {currency} {Number(pur.direct_paid || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-purple-700 text-xs">
                                {currency} {Number(pur.salary_deducted || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-amber-800">
                                {currency} {Number(pur.outstanding_amount || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge
                                  className={
                                    pur.payment_status === "Paid"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : pur.payment_status === "Partially Paid"
                                      ? "bg-blue-100 text-blue-800 border-blue-200"
                                      : "bg-amber-100 text-amber-800 border-amber-200"
                                  }
                                >
                                  {pur.payment_status || "Pending"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-slate-200 text-slate-700 hover:bg-slate-100"
                                  onClick={() => {
                                    setSelectedPurchaseForAudit(pur)
                                    setIsAuditModalOpen(true)
                                  }}
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1 text-slate-500" /> History
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Purchases Pagination */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-center sm:text-left">
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
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              {requestForm.requestType === "salary_advance" && "💵 Request Salary Advance"}
              {requestForm.requestType === "credit_request" && "💳 Request Staff Purchase / Credit"}
              {requestForm.requestType === "leave_request" && "📅 Request Leave"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {requestForm.requestType === "credit_request"
                ? "Submit a request to purchase items on staff credit or store credit account."
                : "Submit your request to management/admin for approval."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {requestForm.requestType !== "leave_request" ? (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  {requestForm.requestType === "credit_request" ? "Purchase / Credit Amount" : "Requested Amount"} ({currency})
                </Label>
                <Input
                  type="number"
                  value={requestForm.amount || ""}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: Number(e.target.value) })}
                  placeholder="e.g. 2500"
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

      {/* MODAL 3: STAFF PURCHASE TRANSACTION HISTORY & AUDIT TRAIL */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ShoppingBag className="h-5 w-5 text-purple-600" />
              Staff Purchase Audit Trail — #{selectedPurchaseForAudit?.tracking_id || selectedPurchaseForAudit?.id}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Detailed record of direct payments and salary deductions applied towards this staff purchase.
            </DialogDescription>
          </DialogHeader>

          {selectedPurchaseForAudit && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Purchase Total</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {currency} {Number(selectedPurchaseForAudit.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Total Settled</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {currency} {Number(selectedPurchaseForAudit.paid_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Outstanding</span>
                  <span className="font-bold text-amber-800 text-sm">
                    {currency} {Number(selectedPurchaseForAudit.outstanding_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Settlement Transactions</span>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedPurchaseForAudit.settlements?.length || 0} Transactions
                  </Badge>
                </h4>

                {!selectedPurchaseForAudit.settlements || selectedPurchaseForAudit.settlements.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed text-xs text-slate-500">
                    No direct payments or salary deductions recorded yet.
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b">
                        <tr>
                          <th className="p-2 font-semibold">Date</th>
                          <th className="p-2 font-semibold">Type</th>
                          <th className="p-2 font-semibold">Details</th>
                          <th className="p-2 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPurchaseForAudit.settlements.map((st: any) => (
                          <tr key={st.id} className="hover:bg-slate-50/50">
                            <td className="p-2 font-mono text-[11px]">
                              {new Date(st.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-2">
                              {st.settlement_type === "direct_payment" ? (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] px-1.5 py-0">
                                  Direct Payment
                                </Badge>
                              ) : (
                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5 py-0">
                                  Salary Deduction
                                </Badge>
                              )}
                            </td>
                            <td className="p-2 text-slate-600 text-[11px]">
                              {st.settlement_type === "salary_deduction" ? (
                                <span>Salary: {st.salary_month || st.payment_month || "Payroll"}</span>
                              ) : (
                                <span>{st.payment_method || "Direct Cash/UPI"}</span>
                              )}
                            </td>
                            <td className="p-2 text-right font-bold text-slate-900">
                              {currency} {Number(st.amount || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAuditModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
