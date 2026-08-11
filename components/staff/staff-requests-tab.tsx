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
  CreditCard,
  Calendar,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  User,
  Package
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  createStaffRequest,
  getStaffRequests,
  getStaffPurchaseDetails
} from "@/app/actions/staff-request-actions"
import { getSalaryPaymentHistory } from "@/app/actions/salary-actions"
import { useAppSelector } from "@/store/hooks"
import { selectDevice } from "@/store/slices/deviceSlice"

export default function StaffRequestsTab() {
  const [activeTab, setActiveTab] = useState<"requests" | "salary" | "purchases">("requests")
  const device = useAppSelector(selectDevice)
  const currency = device?.currency || "INR"

  // Requests state
  const [requests, setRequests] = useState<any[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(true)

  // Submit Request Modal
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

  // Salary & Purchases state
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [isLoadingSalary, setIsLoadingSalary] = useState(false)
  const [purchaseDetails, setPurchaseDetails] = useState<any>(null)
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false)

  const { toast } = useToast()

  const fetchRequests = async () => {
    if (!device?.id) return
    setIsLoadingRequests(true)
    try {
      const res = await getStaffRequests({ deviceId: device.id })
      if (res.success) {
        setRequests(res.data)
      }
    } catch (err) {
      console.error("Error fetching requests:", err)
    } finally {
      setIsLoadingRequests(false)
    }
  }

  const fetchSalaryHistory = async () => {
    if (!device?.id) return
    setIsLoadingSalary(true)
    try {
      const res = await getSalaryPaymentHistory(device.id)
      if (res.success) {
        setSalaryHistory(res.data)
      }
    } catch (err) {
      console.error("Error fetching salary history:", err)
    } finally {
      setIsLoadingSalary(false)
    }
  }

  const fetchPurchases = async () => {
    if (!device?.id) return
    setIsLoadingPurchases(true)
    try {
      // staffId will be resolved from session on server
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
    if (activeTab === "requests") fetchRequests()
    if (activeTab === "salary") fetchSalaryHistory()
    if (activeTab === "purchases") fetchPurchases()
  }, [device?.id, activeTab])

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
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            My Requests, Salary & Activity
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit salary advances, credit and leave requests, view payslips, and check activity details
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="requests" className="text-xs font-semibold">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              My Requests
            </TabsTrigger>
            <TabsTrigger value="salary" className="text-xs font-semibold">
              <Banknote className="h-3.5 w-3.5 mr-1.5" />
              My Salary
            </TabsTrigger>
            <TabsTrigger value="purchases" className="text-xs font-semibold">
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              Sales & Purchases
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab 1: My Requests */}
      {activeTab === "requests" && (
        <div className="space-y-6">
          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleOpenSubmit("salary_advance")}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-lg group-hover:scale-110 transition-transform">
                  <Banknote className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Salary Advance</h4>
                  <p className="text-xs text-slate-500">Request an advance on monthly salary</p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleOpenSubmit("credit_request")}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-3 bg-purple-100 text-purple-700 rounded-lg group-hover:scale-110 transition-transform">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Credit Request</h4>
                  <p className="text-xs text-slate-500">Request staff credit / store credit limit</p>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleOpenSubmit("leave_request")}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-lg group-hover:scale-110 transition-transform">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Leave Request</h4>
                  <p className="text-xs text-slate-500">Submit casual, sick, or paid leave</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Requests History List */}
          <Card>
            <CardHeader className="py-4 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">My Submitted Requests</CardTitle>
                <CardDescription className="text-xs">Track approval status of your advance, credit, and leave requests</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={fetchRequests} className="text-xs">
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoadingRequests ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-slate-600">Loading your requests...</span>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  You haven't submitted any requests yet. Use the buttons above to request salary advance, credit, or leave.
                </div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                      <th className="p-3">Request Date</th>
                      <th className="p-3">Request Type</th>
                      <th className="p-3">Details / Amount</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Admin Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.map((req: any) => (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-xs text-slate-600">
                          {formatDateVal(req.created_at)}
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
                        <td className="p-3 text-slate-700 text-xs">{req.reason}</td>
                        <td className="p-3">
                          {req.status === "Approved" && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
                            </Badge>
                          )}
                          {req.status === "Paid" && (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                            </Badge>
                          )}
                          {req.status === "Pending" && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <Clock className="h-3 w-3 mr-1" /> Pending Review
                            </Badge>
                          )}
                          {req.status === "Rejected" && (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                              <XCircle className="h-3 w-3 mr-1" /> Rejected
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-xs text-slate-500 italic">
                          {req.admin_remarks || "-"}
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

      {/* Tab 2: My Salary */}
      {activeTab === "salary" && (
        <Card>
          <CardHeader className="py-4 border-b">
            <CardTitle className="text-base font-semibold">My Salary & Payment History</CardTitle>
            <CardDescription className="text-xs">View all historical monthly salary payments and payslips</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoadingSalary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                <span className="text-sm font-medium text-slate-600">Loading salary history...</span>
              </div>
            ) : salaryHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">No salary payments recorded yet.</div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                    <th className="p-3">Payment Date</th>
                    <th className="p-3">Month</th>
                    <th className="p-3">Base Salary</th>
                    <th className="p-3">Bonus</th>
                    <th className="p-3">Advance / Deductions</th>
                    <th className="p-3">Net Received</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salaryHistory.map((pmt: any) => (
                    <tr key={pmt.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-xs text-slate-600">
                        {formatDateVal(pmt.payment_date)}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{pmt.payment_month}</td>
                      <td className="p-3">{formatCurr(Number(pmt.base_salary))}</td>
                      <td className="p-3 text-emerald-700">+{formatCurr(Number(pmt.bonus || 0))}</td>
                      <td className="p-3 text-amber-700">
                        -{formatCurr(Number(pmt.advance_deduction || 0) + Number(pmt.other_deductions || 0))}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{formatCurr(Number(pmt.net_salary))}</td>
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

      {/* Tab 3: Sales & Purchases */}
      {activeTab === "purchases" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs text-blue-100 uppercase font-semibold">Total Revenue Handled</p>
                  <h3 className="text-2xl font-extrabold mt-1">
                    {formatCurr(purchaseDetails?.totalSalesAmount || 0)}
                  </h3>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-200 opacity-80" />
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-600 to-indigo-800 text-white border-0">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs text-purple-100 uppercase font-semibold">Orders / Job Cards Created</p>
                  <h3 className="text-2xl font-extrabold mt-1">
                    {purchaseDetails?.totalOrdersCount || 0}
                  </h3>
                </div>
                <Package className="h-8 w-8 text-purple-200 opacity-80" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-base font-semibold">Recent Sales & Job Cards</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoadingPurchases ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-slate-600">Loading purchase activity...</span>
                </div>
              ) : purchaseDetails?.sales?.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No sales or purchases created yet.</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-semibold">
                      <th className="p-3">Order #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3">Paid Amount</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchaseDetails?.sales?.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold text-blue-600">#{sale.id}</td>
                        <td className="p-3 text-xs text-slate-600">
                          {formatDateVal(sale.sale_date)}
                        </td>
                        <td className="p-3 font-medium text-slate-900">
                          {sale.customer_name || "Walk-in Customer"}
                        </td>
                        <td className="p-3 font-semibold">{formatCurr(Number(sale.total_amount))}</td>
                        <td className="p-3 text-emerald-700 font-semibold">{formatCurr(Number(sale.total_paid || sale.total_amount))}</td>
                        <td className="p-3">
                          <Badge className="bg-slate-100 text-slate-800">{sale.status || "Completed"}</Badge>
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

      {/* Submit Request Modal */}
      <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {requestForm.requestType === "salary_advance" && "💵 Request Salary Advance"}
              {requestForm.requestType === "credit_request" && "💳 Request Staff Credit"}
              {requestForm.requestType === "leave_request" && "📅 Request Leave"}
            </DialogTitle>
            <DialogDescription>
              Submit your request to admin/management for review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {requestForm.requestType === "leave_request" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">Start Date *</Label>
                    <Input
                      type="date"
                      value={requestForm.startDate}
                      onChange={(e) => setRequestForm({ ...requestForm, startDate: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">End Date *</Label>
                    <Input
                      type="date"
                      value={requestForm.endDate}
                      onChange={(e) => setRequestForm({ ...requestForm, endDate: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Leave Type</Label>
                  <Select
                    value={requestForm.leaveType}
                    onValueChange={(val) => setRequestForm({ ...requestForm, leaveType: val })}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Casual">Casual Leave</SelectItem>
                      <SelectItem value="Sick">Sick Leave</SelectItem>
                      <SelectItem value="Paid">Paid Annual Leave</SelectItem>
                      <SelectItem value="Unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div>
                <Label className="text-xs font-semibold">Requested Amount ({currency}) *</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={requestForm.amount}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: Number(e.target.value) })}
                  className="text-xs font-bold text-slate-900"
                />
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">Reason / Description *</Label>
              <Textarea
                placeholder="Explain the reason for your request..."
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                className="text-xs h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSubmitOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmitRequest} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
