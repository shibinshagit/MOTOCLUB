"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { getStaffPurchaseDetails } from "@/app/actions/staff-request-actions"
import { reassignSaleOwnership } from "@/app/actions/sale-actions"
import { getStaffAttendanceHistory, type AttendanceRecord } from "@/app/actions/attendance-actions"
import { matchSaleSemantic } from "@/lib/sale-search"
import {
  User,
  Phone,
  Mail,
  Briefcase,
  Calendar,
  Banknote,
  TrendingUp,
  Package,
  CreditCard,
  Search,
  Loader2,
  UserCheck,
  ArrowRightLeft,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  MessageSquare,
} from "lucide-react"

interface StaffProfileModalProps {
  isOpen: boolean
  onClose: () => void
  staffMember: any
  deviceId: number
  allStaffList?: any[]
  currency?: string
  onOwnershipChanged?: () => void
}

export function StaffProfileModal({
  isOpen,
  onClose,
  staffMember,
  deviceId,
  allStaffList = [],
  currency = "INR",
  onOwnershipChanged,
}: StaffProfileModalProps) {
  const { toast } = useToast()
  const [activeModalSection, setActiveModalSection] = useState<"sales" | "attendance">("sales")
  const [isLoading, setIsLoading] = useState(false)
  const [purchaseData, setPurchaseData] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDate, setSelectedDate] = useState("")
  const [reassigningSaleId, setReassigningSaleId] = useState<number | null>(null)

  // Attendance state for Admin view
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([])
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1)
  const [attYear, setAttYear] = useState(new Date().getFullYear())
  const [attSearchTerm, setAttSearchTerm] = useState("")
  const [selectedNoteRecord, setSelectedNoteRecord] = useState<AttendanceRecord | null>(null)

  const loadStaffDetails = useCallback(async () => {
    if (!staffMember?.id || !deviceId) return
    setIsLoading(true)
    try {
      const res = await getStaffPurchaseDetails(staffMember.id, deviceId)
      if (res.success) {
        setPurchaseData(res.data)
      } else {
        notifyError(toast, res.message || "Failed to load staff sales history")
      }
    } catch (err: any) {
      notifyError(toast, "Error fetching staff profile details")
    } finally {
      setIsLoading(false)
    }
  }, [staffMember, deviceId, toast])

  const loadAttendanceHistory = useCallback(async () => {
    if (!staffMember?.id) return
    setIsLoadingAttendance(true)
    try {
      const startDate = `${attYear}-${String(attMonth).padStart(2, "0")}-01`
      const endDate = `${attYear}-${String(attMonth).padStart(2, "0")}-31`
      const res = await getStaffAttendanceHistory(staffMember.id, startDate, endDate)
      if (res.success && res.data) {
        setAttendanceHistory(res.data)
      }
    } catch (err: any) {
      console.error("Error fetching staff attendance history:", err)
    } finally {
      setIsLoadingAttendance(false)
    }
  }, [staffMember?.id, attMonth, attYear])

  useEffect(() => {
    if (isOpen && staffMember) {
      loadStaffDetails()
    }
  }, [isOpen, staffMember, loadStaffDetails])

  useEffect(() => {
    if (isOpen && staffMember && activeModalSection === "attendance") {
      loadAttendanceHistory()
    }
  }, [isOpen, staffMember, activeModalSection, loadAttendanceHistory])

  const handleReassign = async (saleId: number, targetStaffIdStr: string) => {
    try {
      setReassigningSaleId(saleId)
      const targetStaffId = targetStaffIdStr === "" ? null : Number(targetStaffIdStr)
      const res = await reassignSaleOwnership(saleId, deviceId, targetStaffId)
      if (res.success) {
        notifySuccess(toast, "Job card / sale ownership reassigned successfully!")
        await loadStaffDetails()
        if (onOwnershipChanged) onOwnershipChanged()
      } else {
        notifyError(toast, res.message || "Failed to reassign ownership")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Error reassigning ownership")
    } finally {
      setReassigningSaleId(null)
    }
  }

  const formatDate = (val: any) => {
    if (!val) return "-"
    let d: Date | null = null
    if (val instanceof Date) {
      d = isNaN(val.getTime()) ? null : val
    } else if (typeof val === "string") {
      const parsed = new Date(val)
      d = isNaN(parsed.getTime()) ? null : parsed
    }
    if (!d) return String(val || "-")
    const day = String(d.getDate()).padStart(2, "0")
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

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

  const formatCurr = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    })
      .format(val)
      .replace(/^[a-zA-Z]+/, (match) => match + " ")
  }

  const availableMonths = useMemo(() => {
    const salesList = purchaseData?.sales || []
    const monthsSet = new Set<string>()

    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthsSet.add(yyyyMm)
    }

    salesList.forEach((s: any) => {
      if (s.sale_date) {
        const dStr = typeof s.sale_date === "string" ? s.sale_date.split("T")[0] : ""
        if (dStr && dStr.length >= 7) {
          monthsSet.add(dStr.slice(0, 7))
        }
      }
    })

    return Array.from(monthsSet).sort().reverse()
  }, [purchaseData?.sales])

  const formatMonthLabel = (yyyyMm: string) => {
    if (!yyyyMm) return "All Months"
    const [year, month] = yyyyMm.split("-")
    const d = new Date(Number(year), Number(month) - 1, 1)
    return d.toLocaleString("en-US", { month: "long", year: "numeric" })
  }

  const filteredSales = useMemo(() => {
    const salesList = purchaseData?.sales || []
    return salesList.filter((s: any) => {
      if (searchTerm && !matchSaleSemantic(s, searchTerm)) {
        return false
      }

      let saleDateStr = ""
      if (s.sale_date) {
        if (typeof s.sale_date === "string") {
          saleDateStr = s.sale_date.split("T")[0]
        } else if (s.sale_date instanceof Date) {
          saleDateStr = s.sale_date.toISOString().split("T")[0]
        }
      }

      if (selectedDate && saleDateStr !== selectedDate) {
        return false
      }

      if (selectedMonth && !saleDateStr.startsWith(selectedMonth)) {
        return false
      }

      return true
    })
  }, [purchaseData?.sales, searchTerm, selectedDate, selectedMonth])

  const filteredRevenue = useMemo(() => {
    return filteredSales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0)
  }, [filteredSales])

  const filteredOrdersCount = filteredSales.length

  const filteredAttendance = useMemo(() => {
    if (!attSearchTerm) return attendanceHistory
    const term = attSearchTerm.toLowerCase()
    return attendanceHistory.filter((rec) => {
      const dStr = typeof rec.date === "string" ? rec.date : new Date(rec.date).toISOString()
      const statusStr = (rec.status || "").toLowerCase()
      const remarksStr = (rec.remarks || "").toLowerCase()
      return dStr.includes(term) || statusStr.includes(term) || remarksStr.includes(term)
    })
  }, [attendanceHistory, attSearchTerm])

  const attendanceSummary = useMemo(() => {
    const totalDays = attendanceHistory.length
    const present = attendanceHistory.filter((r) => r.status === "Present" || (r.check_in && !r.status)).length
    const absent = attendanceHistory.filter((r) => r.status === "Absent").length
    const leave = attendanceHistory.filter((r) => r.status === "Leave").length
    const notesCount = attendanceHistory.filter((r) => r.remarks && r.remarks.trim().length > 0).length
    return { totalDays, present, absent, leave, notesCount }
  }, [attendanceHistory])

  const renderAdminCalendar = () => {
    const daysInMonth = new Date(attYear, attMonth, 0).getDate()
    const firstDay = new Date(attYear, attMonth - 1, 1).getDay()

    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-11 bg-slate-50/50 border border-slate-100 rounded-lg"></div>)
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${attYear}-${String(attMonth).padStart(2, "0")}-${String(i).padStart(2, "0")}`
      const record = attendanceHistory.find((r) => {
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
        } else if (record.status === "Note") {
          bgClass = "bg-amber-50/90 border-amber-300 hover:bg-amber-100 text-amber-900"
          statusDot = <span className="h-2 w-2 rounded-full bg-amber-500"></span>
        }
      }

      days.push(
        <div
          key={i}
          onClick={() => record && setSelectedNoteRecord(record)}
          className={`h-11 p-1.5 border rounded-lg flex flex-col justify-between cursor-pointer transition-all ${bgClass} ${
            isToday ? "ring-2 ring-blue-600 font-bold shadow-xs" : ""
          }`}
          title={record?.remarks ? `Daily Note: ${record.remarks}` : record ? `Status: ${record.status || 'Present'}` : "No activity"}
        >
          <div className="flex justify-between items-center text-xs">
            <span className={isToday ? "text-blue-700 font-bold" : "text-slate-700 font-semibold"}>{i}</span>
            <div className="flex items-center gap-1">
              {record?.remarks && <FileText className="h-3.5 w-3.5 text-amber-600" />}
              {statusDot}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 truncate font-mono">
            {record?.check_in ? formatTime(record.check_in) : record?.remarks ? "Note" : ""}
          </div>
        </div>
      )
    }

    return (
      <div>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">{days}</div>
      </div>
    )
  }

  if (!staffMember) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        {/* Header Profile Section */}
        <DialogHeader className="p-6 bg-white border-b shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xl shadow-md">
                {(staffMember.name || "S").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-xl font-extrabold text-slate-900">
                    {staffMember.name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={
                      staffMember.role === "partner"
                        ? "border-purple-300 bg-purple-100 text-purple-800 font-semibold"
                        : staffMember.role === "admin"
                        ? "border-amber-300 bg-amber-100 text-amber-800 font-semibold"
                        : "border-blue-300 bg-blue-100 text-blue-800 font-semibold"
                    }
                  >
                    {staffMember.role || "Staff"}
                  </Badge>
                  {staffMember.status && (
                    <Badge
                      className={
                        staffMember.status === "active"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-medium"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-100 font-medium"
                      }
                    >
                      {staffMember.status}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-slate-500 font-medium">
                  {staffMember.position && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                      {staffMember.position}
                    </span>
                  )}
                  {staffMember.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {staffMember.phone}
                    </span>
                  )}
                  {staffMember.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {staffMember.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              {staffMember.base_salary != null && (
                <div className="text-right px-3 py-1.5 bg-slate-100 rounded-lg border">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Base Salary</p>
                  <p className="font-extrabold text-sm text-slate-900">{formatCurr(staffMember.base_salary)}</p>
                </div>
              )}
              {staffMember.created_at && (
                <div className="text-right px-3 py-1.5 bg-slate-100 rounded-lg border">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Joined On</p>
                  <p className="font-extrabold text-sm text-slate-900">{formatDate(staffMember.created_at)}</p>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Sub-Navigation Switcher Bar */}
        <div className="flex items-center justify-between border-b px-6 py-3 bg-slate-100/80 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={activeModalSection === "sales" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveModalSection("sales")}
              className={activeModalSection === "sales" ? "bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs" : "text-slate-700 text-xs bg-white"}
            >
              <Briefcase className="h-3.5 w-3.5 mr-1.5" />
              Sales & Job Cards
            </Button>
            <Button
              type="button"
              variant={activeModalSection === "attendance" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveModalSection("attendance")}
              className={activeModalSection === "attendance" ? "bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs" : "text-slate-700 text-xs bg-white"}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
              Attendance & Daily Notes
              {attendanceSummary.notesCount > 0 && (
                <Badge className="ml-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-1.5 py-0">
                  {attendanceSummary.notesCount} Notes
                </Badge>
              )}
            </Button>
          </div>

          {activeModalSection === "attendance" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-white"
                onClick={() => {
                  if (attMonth === 1) {
                    setAttMonth(12)
                    setAttYear((y) => y - 1)
                  } else {
                    setAttMonth((m) => m - 1)
                  }
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-bold text-slate-800 min-w-[110px] text-center">
                {new Date(attYear, attMonth - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-white"
                onClick={() => {
                  if (attMonth === 12) {
                    setAttMonth(1)
                    setAttYear((y) => y + 1)
                  } else {
                    setAttMonth((m) => m + 1)
                  }
                }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeModalSection === "sales" ? (
            <>
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 shadow-xs">
                  <CardContent className="p-3.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                          Revenue Handled
                        </p>
                        <h4 className="text-lg font-black text-slate-900 mt-0.5">
                          {formatCurr(filteredRevenue)}
                        </h4>
                      </div>
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-xs">
                  <CardContent className="p-3.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                          Total Orders / Jobcards
                        </p>
                        <h4 className="text-lg font-black text-slate-900 mt-0.5">
                          {filteredOrdersCount}
                        </h4>
                      </div>
                      <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                        <Package className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 shadow-xs">
                  <CardContent className="p-3.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                          Purchase Outstanding
                        </p>
                        <h4 className="text-lg font-black text-amber-900 mt-0.5">
                          {formatCurr(purchaseData?.outstandingBalance || 0)}
                        </h4>
                      </div>
                      <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                        <Banknote className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-xs">
                  <CardContent className="p-3.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                          Advance & Credit Limit
                        </p>
                        <h4 className="text-lg font-black text-slate-900 mt-0.5">
                          {formatCurr(purchaseData?.totalCreditLimit || purchaseData?.totalAdvanceBalance || 0)}
                        </h4>
                      </div>
                      <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                        <CreditCard className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Individual Sales Table & Reassignment Controls */}
              <Card className="border bg-white shadow-xs overflow-hidden">
                <div className="p-4 border-b flex flex-col gap-3 bg-slate-50/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Individual Sales & Job Cards List
                      </h3>
                      <p className="text-xs text-slate-500">
                        View and change job card / sale ownership to any staff member or admin
                      </p>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search by Order # or Customer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 text-xs bg-white"
                      />
                    </div>
                  </div>

                  {/* Month & Date Filtration Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1">
                      <Calendar className="h-3.5 w-3.5 text-blue-600" />
                      Filter:
                    </div>

                    {/* Month Dropdown */}
                    <div className="flex items-center gap-1">
                      <label htmlFor="modal-month-select" className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                        Month:
                      </label>
                      <select
                        id="modal-month-select"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value)
                          if (e.target.value) setSelectedDate("")
                        }}
                        className="h-7 text-xs bg-white border border-slate-300 rounded px-2 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                      >
                        <option value="">All Months</option>
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatMonthLabel(m)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Picker Input */}
                    <div className="flex items-center gap-1">
                      <label htmlFor="modal-date-select" className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                        Date:
                      </label>
                      <Input
                        id="modal-date-select"
                        type="date"
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value)
                          if (e.target.value) setSelectedMonth("")
                        }}
                        className="h-7 w-36 text-xs bg-white px-2 py-0 border-slate-300"
                      />
                    </div>

                    {/* Quick Presets */}
                    <Button
                      type="button"
                      variant={!selectedMonth && !selectedDate ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => {
                        setSelectedMonth("")
                        setSelectedDate("")
                      }}
                    >
                      All
                    </Button>

                    <Button
                      type="button"
                      variant={selectedMonth === new Date().toISOString().slice(0, 7) && !selectedDate ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => {
                        setSelectedMonth(new Date().toISOString().slice(0, 7))
                        setSelectedDate("")
                      }}
                    >
                      This Month
                    </Button>

                    <Button
                      type="button"
                      variant={selectedDate === new Date().toISOString().slice(0, 10) ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => {
                        setSelectedDate(new Date().toISOString().slice(0, 10))
                        setSelectedMonth("")
                      }}
                    >
                      Today
                    </Button>

                    {/* Reset Filters button */}
                    {(selectedMonth || selectedDate || searchTerm) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 ml-auto"
                        onClick={() => {
                          setSelectedMonth("")
                          setSelectedDate("")
                          setSearchTerm("")
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reset Filters
                      </Button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto min-h-[220px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                      <span className="text-sm font-medium">Loading sales activity...</span>
                    </div>
                  ) : filteredSales.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm">
                      {searchTerm ? "No sales found matching search query." : "No sales or job cards handled by this staff member yet."}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b text-[11px] uppercase text-slate-600 font-bold">
                          <th className="p-3">Order / Job Card #</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Total Amount</th>
                          <th className="p-3">Payment Method</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Assigned Owner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredSales.map((sale: any) => (
                          <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-blue-700">
                              #{sale.id}
                              {sale.sale_type === "job_card" && (
                                <Badge variant="outline" className="ml-1.5 text-[9px] border-indigo-200 text-indigo-700 bg-indigo-50">
                                  Job Card
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{formatDate(sale.sale_date)}</td>
                            <td className="p-3">
                              <p className="font-semibold text-slate-900">{sale.customer_name || "Walk-in Customer"}</p>
                              {sale.customer_phone && <p className="text-[10px] text-slate-400">{sale.customer_phone}</p>}
                            </td>
                            <td className="p-3 font-bold text-slate-900">{formatCurr(Number(sale.total_amount || 0))}</td>
                            <td className="p-3 text-slate-700 font-medium">{sale.payment_method || "Cash"}</td>
                            <td className="p-3">
                              {(sale.payment_status === "Paid" ||
                                sale.payment_status === "Completed" ||
                                (!sale.payment_status && (sale.status === "Completed" || sale.status === "completed"))) &&
                              sale.payment_status?.toLowerCase() !== "pending" ? (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                                  Paid
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                                  {sale.payment_status || sale.status || "Pending"}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {reassigningSaleId === sale.id && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                )}
                                <select
                                  value={String(sale.staff_id || "")}
                                  disabled={reassigningSaleId === sale.id}
                                  onChange={(e) => handleReassign(sale.id, e.target.value)}
                                  className="h-7 text-xs bg-white border border-slate-300 rounded px-2 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs max-w-[160px]"
                                >
                                  <option value="">Store / Admin</option>
                                  {allStaffList.map((s: any) => (
                                    <option key={s.id} value={String(s.id)}>
                                      {s.name} ({s.position || "Staff"})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </>
          ) : (
            /* ATTENDANCE & DAILY NOTES SECTION FOR ADMIN */
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-gradient-to-br from-slate-50 to-indigo-50 border-indigo-100 shadow-2xs">
                  <CardContent className="p-3.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Present Days</p>
                    <h4 className="text-xl font-black text-emerald-700 mt-0.5">{attendanceSummary.present}</h4>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-rose-50 to-pink-50 border-rose-100 shadow-2xs">
                  <CardContent className="p-3.5">
                    <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Absent Days</p>
                    <h4 className="text-xl font-black text-rose-700 mt-0.5">{attendanceSummary.absent}</h4>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100 shadow-2xs">
                  <CardContent className="p-3.5">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Leave Days</p>
                    <h4 className="text-xl font-black text-purple-700 mt-0.5">{attendanceSummary.leave}</h4>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 shadow-2xs">
                  <CardContent className="p-3.5">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Daily Notes / Remarks</p>
                    <h4 className="text-xl font-black text-amber-800 mt-0.5">{attendanceSummary.notesCount}</h4>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Attendance Calendar */}
              <Card className="border bg-white shadow-2xs">
                <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      Attendance Calendar View
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click any highlighted day to inspect the staff daily remarks & attendance detail
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold bg-white">
                    {new Date(attYear, attMonth - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  {isLoadingAttendance ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  ) : (
                    renderAdminCalendar()
                  )}
                </CardContent>
              </Card>

              {/* Attendance & Daily Notes Log Table */}
              <Card className="border bg-white shadow-2xs overflow-hidden">
                <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Attendance & Daily Notes Records
                    </h3>
                    <p className="text-xs text-slate-500">
                      Daily notes and attendance remarks logged by {staffMember.name}
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search notes or status..."
                      value={attSearchTerm}
                      onChange={(e) => setAttSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto min-h-[180px]">
                  {isLoadingAttendance ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  ) : filteredAttendance.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      No attendance or daily notes logged for this month.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b text-[11px] uppercase text-slate-600 font-bold">
                          <th className="p-3">Date</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Check In</th>
                          <th className="p-3">Check Out</th>
                          <th className="p-3">Working Hrs</th>
                          <th className="p-3">Remarks / Daily Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredAttendance.map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                              {formatDate(rec.date)}
                            </td>
                            <td className="p-3">
                              <Badge
                                className={
                                  rec.status === "Present" || (rec.check_in && !rec.status)
                                    ? "bg-emerald-100 text-emerald-800"
                                    : rec.status === "Absent"
                                    ? "bg-rose-100 text-rose-800"
                                    : rec.status === "Leave"
                                    ? "bg-purple-100 text-purple-800"
                                    : rec.status === "Note"
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-slate-100 text-slate-800"
                                }
                              >
                                {rec.status === "Note" ? "Note Added" : rec.status || (rec.check_in ? "Present" : "Not Marked")}
                              </Badge>
                            </td>
                            <td className="p-3 text-slate-700 font-medium">{formatTime(rec.check_in)}</td>
                            <td className="p-3 text-slate-700 font-medium">{formatTime(rec.check_out)}</td>
                            <td className="p-3 text-slate-700 font-medium">{formatHours(rec.working_minutes)}</td>
                            <td className="p-3">
                              {rec.remarks ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedNoteRecord(rec)}
                                  className="flex items-center gap-1.5 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md text-xs font-medium max-w-[280px] text-left transition-colors shadow-2xs group"
                                  title="Click to view full note"
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-amber-600 group-hover:scale-110 transition-transform" />
                                  <span className="truncate">{rec.remarks}</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Note Inspector Dialog */}
      <Dialog open={!!selectedNoteRecord} onOpenChange={(open) => !open && setSelectedNoteRecord(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              Day Note — {selectedNoteRecord ? formatDate(selectedNoteRecord.date) : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedNoteRecord && (
            <div className="space-y-4 py-2 text-xs">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Staff Member</p>
                  <p className="font-bold text-slate-900 text-sm">{staffMember.name}</p>
                </div>
                <Badge
                  className={
                    selectedNoteRecord.status === "Present"
                      ? "bg-emerald-100 text-emerald-800"
                      : selectedNoteRecord.status === "Absent"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-amber-100 text-amber-800"
                  }
                >
                  {selectedNoteRecord.status || "Note Recorded"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-700">
                <div className="p-2.5 bg-slate-50 rounded-md border">
                  <span className="text-slate-400 font-medium block text-[10px]">Check In</span>
                  <span className="font-bold text-slate-900">{formatTime(selectedNoteRecord.check_in)}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-md border">
                  <span className="text-slate-400 font-medium block text-[10px]">Check Out</span>
                  <span className="font-bold text-slate-900">{formatTime(selectedNoteRecord.check_out)}</span>
                </div>
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1.5">Daily Remarks / Note</label>
                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedNoteRecord.remarks || "No remarks entered."}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
