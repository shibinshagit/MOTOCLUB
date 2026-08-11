"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  UserCheck,
  Calendar,
  FileText,
  CreditCard,
  Plus,
  Loader2,
  Search,
  Filter,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  Briefcase
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  getStaffPayrollSummary,
  createSalaryPayment,
  updateSalaryPaymentStatus,
  getSalaryPaymentHistory
} from "@/app/actions/salary-actions"
import {
  getStaffRequests,
  updateStaffRequestStatus
} from "@/app/actions/staff-request-actions"

interface PayrollRequestsTabProps {
  deviceId: number
  currency?: string
  initialSubTab?: "payroll" | "requests" | "history"
}

export default function PayrollRequestsTab({ deviceId, currency = "INR", initialSubTab = "payroll" }: PayrollRequestsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"payroll" | "requests" | "history">(initialSubTab)
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7))
  const [payrollSummary, setPayrollSummary] = useState<any>(null)
  const [isLoadingPayroll, setIsLoadingPayroll] = useState(true)

  // Salary Payment Modal state
  const [isPaySalaryOpen, setIsPaySalaryOpen] = useState(false)
  const [selectedStaffForPay, setSelectedStaffForPay] = useState<any>(null)
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().split("T")[0],
    baseSalary: 0,
    bonus: 0,
    advanceDeduction: 0,
    otherDeductions: 0,
    paymentMethod: "Bank Transfer",
    referenceNumber: "",
    notes: "",
    status: "Approved"
  })
  const [isSubmittingPay, setIsSubmittingPay] = useState(false)

  // Requests state
  const [requests, setRequests] = useState<any[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(true)
  const [requestFilterType, setRequestFilterType] = useState<string>("all")
  const [requestFilterStatus, setRequestFilterStatus] = useState<string>("all")

  // Action Modal State for Requests
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean
    request: any
    action: "Approved" | "Rejected" | "Paid"
    remarks: string
  }>({
    isOpen: false,
    request: null,
    action: "Approved",
    remarks: ""
  })
  const [isSubmittingRequestAction, setIsSubmittingRequestAction] = useState(false)

  // History state
  const [history, setHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const { toast } = useToast()

  // Load Payroll Summary
  const fetchPayroll = async () => {
    if (!deviceId) return
    setIsLoadingPayroll(true)
    try {
      const res = await getStaffPayrollSummary(deviceId, selectedMonth)
      if (res.success) {
        setPayrollSummary(res.data)
      } else {
        notifyError(toast, res.message || "Failed to load payroll", "Error")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "An error occurred", "Error")
    } finally {
      setIsLoadingPayroll(false)
    }
  }

  // Load Staff Requests
  const fetchRequests = async () => {
    if (!deviceId) return
    setIsLoadingRequests(true)
    try {
      const typeParam = requestFilterType === "all" ? undefined : requestFilterType
      const statusParam = requestFilterStatus === "all" ? undefined : requestFilterStatus
      const res = await getStaffRequests({ deviceId, requestType: typeParam, status: statusParam })
      if (res.success) {
        setRequests(res.data)
      }
    } catch (err) {
      console.error("Error loading requests:", err)
    } finally {
      setIsLoadingRequests(false)
    }
  }

  // Load History
  const fetchHistory = async () => {
    if (!deviceId) return
    setIsLoadingHistory(true)
    try {
      const res = await getSalaryPaymentHistory(deviceId)
      if (res.success) {
        setHistory(res.data)
      }
    } catch (err) {
      console.error("Error loading salary history:", err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (activeSubTab === "payroll") fetchPayroll()
    if (activeSubTab === "requests") fetchRequests()
    if (activeSubTab === "history") fetchHistory()
  }, [deviceId, selectedMonth, activeSubTab, requestFilterType, requestFilterStatus])

  // Open Pay Modal for a staff member
  const handleOpenPayModal = (staff: any) => {
    setSelectedStaffForPay(staff)
    setPayForm({
      paymentDate: new Date().toISOString().split("T")[0],
      baseSalary: staff.baseSalary || 0,
      bonus: 0,
      advanceDeduction: staff.advanceTaken || 0,
      otherDeductions: 0,
      paymentMethod: "Bank Transfer",
      referenceNumber: "",
      notes: "",
      status: "Approved"
    })
    setIsPaySalaryOpen(true)
  }

  // Calculate Net Salary
  const netSalary = Math.max(
    0,
    Number(payForm.baseSalary || 0) +
      Number(payForm.bonus || 0) -
      Number(payForm.advanceDeduction || 0) -
      Number(payForm.otherDeductions || 0)
  )

  // Submit Salary Payment
  const handlePaySalarySubmit = async () => {
    if (!selectedStaffForPay || !deviceId) return
    setIsSubmittingPay(true)
    try {
      const res = await createSalaryPayment({
        staffId: selectedStaffForPay.staffId,
        deviceId,
        paymentMonth: selectedMonth,
        paymentDate: payForm.paymentDate,
        baseSalary: Number(payForm.baseSalary),
        bonus: Number(payForm.bonus),
        advanceDeduction: Number(payForm.advanceDeduction),
        otherDeductions: Number(payForm.otherDeductions),
        netSalary,
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber,
        notes: payForm.notes,
        status: payForm.status
      })

      if (res.success) {
        notifySuccess(toast, res.message, "Success")
        setIsPaySalaryOpen(false)
        fetchPayroll()
      } else {
        notifyError(toast, res.message, "Error")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Failed to submit salary payment", "Error")
    } finally {
      setIsSubmittingPay(false)
    }
  }

  // Submit Request Approval/Rejection
  const handleRequestActionSubmit = async () => {
    if (!actionModal.request) return
    setIsSubmittingRequestAction(true)
    try {
      const res = await updateStaffRequestStatus(
        actionModal.request.id,
        actionModal.action,
        actionModal.remarks
      )
      if (res.success) {
        notifySuccess(toast, res.message, "Success")
        setActionModal({ isOpen: false, request: null, action: "Approved", remarks: "" })
        fetchRequests()
      } else {
        notifyError(toast, res.message, "Error")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Failed to update request", "Error")
    } finally {
      setIsSubmittingRequestAction(false)
    }
  }

  const formatDateVal = (val: any): string => {
    if (!val) return "-"
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? "-" : val.toLocaleDateString()
    }
    if (typeof val === "string") {
      const d = new Date(val)
      return isNaN(d.getTime()) ? val.split("T")[0] : d.toLocaleDateString()
    }
    return String(val)
  }

  const formatCurr = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0
    }).format(amount).replace(/^[a-zA-Z]+/, (match) => match + " ")
  }

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Salary & Staff Requests Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage staff payroll, verify salary payments, approve advances, credit, and leave requests
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={activeSubTab} onValueChange={(val: any) => setActiveSubTab(val)} className="w-auto">
            <TabsList className="bg-slate-100 p-1">
              <TabsTrigger value="payroll" className="text-xs font-semibold">
                <Banknote className="h-3.5 w-3.5 mr-1.5" />
                Payroll & Salaries
              </TabsTrigger>
              <TabsTrigger value="requests" className="text-xs font-semibold">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Staff Requests
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs font-semibold">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Payment History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Subtab 1: Payroll & Salaries */}
      {activeSubTab === "payroll" && (
        <div className="space-y-6">
          {/* Controls & Summary Cards */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold text-slate-700">Select Month:</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-44 text-xs font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-blue-100 uppercase tracking-wider font-semibold">Total Base Salary Budget</p>
                    <h3 className="text-2xl font-extrabold mt-1">
                      {formatCurr(payrollSummary?.totalBaseSalary || 0)}
                    </h3>
                  </div>
                  <DollarSign className="h-8 w-8 text-blue-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-emerald-100 uppercase tracking-wider font-semibold">Total Salary Paid This Month</p>
                    <h3 className="text-2xl font-extrabold mt-1">
                      {formatCurr(payrollSummary?.totalPaid || 0)}
                    </h3>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-emerald-200 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-amber-100 uppercase tracking-wider font-semibold">Active Advances Taken</p>
                    <h3 className="text-2xl font-extrabold mt-1">
                      {formatCurr(payrollSummary?.totalAdvances || 0)}
                    </h3>
                  </div>
                  <CreditCard className="h-8 w-8 text-amber-200 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payroll Table */}
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base font-semibold">Staff Payroll for {selectedMonth}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoadingPayroll ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-slate-600">Loading payroll details...</span>
                </div>
              ) : payrollSummary?.summary?.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No active staff found for this branch.</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                      <th className="p-3">Staff Name</th>
                      <th className="p-3">Position</th>
                      <th className="p-3">Base Salary</th>
                      <th className="p-3">Advance Taken</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Paid Net Salary</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payrollSummary?.summary?.map((staff: any) => (
                      <tr key={staff.staffId} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{staff.name}</p>
                          <p className="text-xs text-slate-500">{staff.phone}</p>
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{staff.position}</td>
                        <td className="p-3 font-semibold text-slate-900">{formatCurr(staff.baseSalary)}</td>
                        <td className="p-3 text-amber-700 font-medium">{formatCurr(staff.advanceTaken)}</td>
                        <td className="p-3">
                          {staff.paymentStatus === "Approved" || staff.paymentStatus === "Paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Paid / Approved
                            </Badge>
                          ) : staff.paymentStatus === "Pending Verification" ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <Clock className="h-3 w-3 mr-1" /> Pending Approval
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Unpaid</Badge>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {staff.paidAmount > 0 ? formatCurr(staff.paidAmount) : "-"}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant={staff.paymentStatus === "Unpaid" ? "default" : "outline"}
                            onClick={() => handleOpenPayModal(staff)}
                            className="h-8 text-xs"
                          >
                            <Banknote className="h-3.5 w-3.5 mr-1" />
                            {staff.paymentStatus === "Unpaid" ? "Pay Salary" : "Edit / Manage"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subtab 2: Staff Requests */}
      {activeSubTab === "requests" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-xl border">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-slate-500" />
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Type:</Label>
                <Select value={requestFilterType} onValueChange={setRequestFilterType}>
                  <SelectTrigger className="w-40 text-xs">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="salary_advance">Salary Advance</SelectItem>
                    <SelectItem value="credit_request">Credit Request</SelectItem>
                    <SelectItem value="leave_request">Leave Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Status:</Label>
                <Select value={requestFilterStatus} onValueChange={setRequestFilterStatus}>
                  <SelectTrigger className="w-36 text-xs">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={fetchRequests} className="text-xs">
              Refresh Requests
            </Button>
          </div>

          {/* Requests Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {isLoadingRequests ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-slate-600">Loading staff requests...</span>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No staff requests found matching filters.</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                      <th className="p-3">Date</th>
                      <th className="p-3">Staff Name</th>
                      <th className="p-3">Request Type</th>
                      <th className="p-3">Details / Amount</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.map((req: any) => (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-xs text-slate-500">
                          {formatDateVal(req.created_at)}
                        </td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{req.staff_name}</p>
                          <p className="text-xs text-slate-500">{req.position}</p>
                        </td>
                        <td className="p-3">
                          {req.request_type === "salary_advance" && (
                            <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50">
                              💵 Salary Advance
                            </Badge>
                          )}
                          {req.request_type === "credit_request" && (
                            <Badge variant="outline" className="border-purple-300 text-purple-800 bg-purple-50">
                              💳 Credit Request
                            </Badge>
                          )}
                          {req.request_type === "leave_request" && (
                            <Badge variant="outline" className="border-blue-300 text-blue-800 bg-blue-50">
                              📅 Leave ({req.leave_type || "Leave"})
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-900">
                          {req.request_type === "leave_request" ? (
                            <span className="text-xs font-medium text-slate-700">
                              {formatDateVal(req.start_date)} to {formatDateVal(req.end_date)}
                            </span>
                          ) : (
                            formatCurr(req.amount || 0)
                          )}
                        </td>
                        <td className="p-3 text-slate-600 text-xs max-w-xs truncate" title={req.reason}>
                          {req.reason}
                        </td>
                        <td className="p-3">
                          {req.status === "Approved" && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>
                          )}
                          {req.status === "Paid" && (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Paid</Badge>
                          )}
                          {req.status === "Pending" && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>
                          )}
                          {req.status === "Rejected" && (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {req.status === "Pending" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setActionModal({ isOpen: true, request: req, action: "Approved", remarks: "" })}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                onClick={() => setActionModal({ isOpen: true, request: req, action: "Rejected", remarks: "" })}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                          {req.status === "Approved" && req.request_type === "salary_advance" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => setActionModal({ isOpen: true, request: req, action: "Paid", remarks: "" })}
                            >
                              <Banknote className="h-3.5 w-3.5 mr-1" /> Mark Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subtab 3: Payment History */}
      {activeSubTab === "history" && (
        <Card>
          <CardHeader className="py-4 border-b">
            <CardTitle className="text-base font-semibold">Historical Salary Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                <span className="text-sm font-medium text-slate-600">Loading history...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No payment history found.</div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                    <th className="p-3">Payment Date</th>
                    <th className="p-3">Month</th>
                    <th className="p-3">Staff Name</th>
                    <th className="p-3">Base Salary</th>
                    <th className="p-3">Bonus</th>
                    <th className="p-3">Deductions</th>
                    <th className="p-3">Net Paid</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((pmt: any) => (
                    <tr key={pmt.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-xs text-slate-600">
                        {formatDateVal(pmt.payment_date)}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{pmt.payment_month}</td>
                      <td className="p-3 font-medium text-slate-900">{pmt.staff_name}</td>
                      <td className="p-3">{formatCurr(Number(pmt.base_salary))}</td>
                      <td className="p-3 text-emerald-700">+{formatCurr(Number(pmt.bonus || 0))}</td>
                      <td className="p-3 text-amber-700">
                        -{formatCurr(Number(pmt.advance_deduction || 0) + Number(pmt.other_deductions || 0))}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{formatCurr(Number(pmt.net_salary))}</td>
                      <td className="p-3 text-xs text-slate-600">{pmt.payment_method}</td>
                      <td className="p-3">
                        <Badge className="bg-emerald-100 text-emerald-800">{pmt.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pay Salary Modal */}
      <Dialog open={isPaySalaryOpen} onOpenChange={setIsPaySalaryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Banknote className="h-5 w-5 text-emerald-600" />
              Pay Salary - {selectedStaffForPay?.name}
            </DialogTitle>
            <DialogDescription>
              Process salary payment for {selectedMonth}. An expense entry under 'Salary & Wages' will be logged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Payment Month</Label>
                <Input value={selectedMonth} readOnly className="bg-slate-50 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Payment Date *</Label>
                <Input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Base Salary ({currency})</Label>
                <Input
                  type="number"
                  value={payForm.baseSalary}
                  onChange={(e) => setPayForm({ ...payForm, baseSalary: Number(e.target.value) })}
                  className="text-xs font-semibold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Bonus ({currency})</Label>
                <Input
                  type="number"
                  value={payForm.bonus}
                  onChange={(e) => setPayForm({ ...payForm, bonus: Number(e.target.value) })}
                  className="text-xs text-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Advance Deduction ({currency})</Label>
                <Input
                  type="number"
                  value={payForm.advanceDeduction}
                  onChange={(e) => setPayForm({ ...payForm, advanceDeduction: Number(e.target.value) })}
                  className="text-xs text-amber-700"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Other Deductions ({currency})</Label>
                <Input
                  type="number"
                  value={payForm.otherDeductions}
                  onChange={(e) => setPayForm({ ...payForm, otherDeductions: Number(e.target.value) })}
                  className="text-xs text-red-700"
                />
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-800">Calculated Net Payable Salary:</span>
              <span className="text-xl font-extrabold text-emerald-900">{formatCurr(netSalary)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Payment Method</Label>
                <Select
                  value={payForm.paymentMethod}
                  onValueChange={(val) => setPayForm({ ...payForm, paymentMethod: val })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Online Transfer">Online Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Ref / Trans #</Label>
                <Input
                  placeholder="Optional reference #"
                  value={payForm.referenceNumber}
                  onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Notes / Remarks</Label>
              <Textarea
                placeholder="Add any notes regarding this salary payout..."
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                className="text-xs h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPaySalaryOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePaySalarySubmit} disabled={isSubmittingPay}>
              {isSubmittingPay && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm Salary Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Request Action Modal */}
      <Dialog open={actionModal.isOpen} onOpenChange={(open) => setActionModal({ ...actionModal, isOpen: open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionModal.action} Request - {actionModal.request?.staff_name}
            </DialogTitle>
            <DialogDescription>
              {actionModal.action === "Approved" && "Approve this request. If leave, attendance will be updated automatically."}
              {actionModal.action === "Paid" && "Mark salary advance as paid and log cash out."}
              {actionModal.action === "Rejected" && "Reject this staff request."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1">
              <p><span className="font-semibold">Type:</span> {actionModal.request?.request_type}</p>
              <p><span className="font-semibold">Reason:</span> {actionModal.request?.reason}</p>
              {actionModal.request?.amount > 0 && <p><span className="font-semibold">Amount:</span> {formatCurr(actionModal.request?.amount)}</p>}
            </div>

            <div>
              <Label className="text-xs font-semibold">Admin Remarks / Notes</Label>
              <Textarea
                placeholder="Enter remarks for the staff member..."
                value={actionModal.remarks}
                onChange={(e) => setActionModal({ ...actionModal, remarks: e.target.value })}
                className="text-xs h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setActionModal({ ...actionModal, isOpen: false })}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={actionModal.action === "Rejected" ? "destructive" : "default"}
              onClick={handleRequestActionSubmit}
              disabled={isSubmittingRequestAction}
            >
              {isSubmittingRequestAction && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm {actionModal.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
