"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  getLeads, 
  getLeadSummary, 
  getLeadDetails, 
  getLeadProducts,
  updateLeadStatus, 
  updateLeadNotes, 
  getCompanyStaff, 
  assignLead,
  setLeadFollowUp,
  getLeadActivities,
  convertLeadToCustomer
} from "@/app/actions/lead-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Phone, Calendar, Briefcase, Clock, Activity as ActivityIcon, UserCheck } from "lucide-react"
import { format, isPast, isToday } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JobCardModal } from "@/components/shared/job-card/job-card-modal"

const STATUSES = ['All', 'New', 'Assigned', 'Contacted', 'Follow Up', 'Interested', 'Converted', 'Lost', 'Invalid']
const MUTABLE_STATUSES = ['New', 'Assigned', 'Contacted', 'Follow Up', 'Interested', 'Converted', 'Lost', 'Invalid']

export default function StaffLeadsTab() {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>({})
  
  // Pagination & Filters
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [assignedFilter, setAssignedFilter] = useState("all") // all, mine, unassigned
  const [followUpFilter, setFollowUpFilter] = useState("all") // all, today, upcoming, overdue
  
  // Modal State
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [leadProducts, setLeadProducts] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  
  // Conversion State
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false)
  const [converting, setConverting] = useState(false)

  // Sale State
  const [isJobCardModalOpen, setIsJobCardModalOpen] = useState(false)

  // Edits
  const [editNotes, setEditNotes] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [editFollowUp, setEditFollowUp] = useState("")
  const [saving, setSaving] = useState(false)
  
  // Staff
  const [staffList, setStaffList] = useState<any[]>([])
  
  const { toast } = useToast()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const res = await getLeads({ 
      page, 
      search: debouncedSearch, 
      status: statusFilter,
      assigned_filter: assignedFilter,
      follow_up_filter: followUpFilter
    })
    if (res.success) {
      setLeads(res.records || [])
      setTotalPages(res.totalPages || 1)
    }
    setLoading(false)
  }, [page, debouncedSearch, statusFilter, assignedFilter, followUpFilter])

  const fetchSummary = useCallback(async () => {
    const res = await getLeadSummary()
    if (res.success) {
      setSummary(res.data)
    }
    const staffRes = await getCompanyStaff()
    if (staffRes.success) {
      setStaffList(staffRes.data)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const loadLeadData = async (id: number) => {
    const [leadRes, actRes, prodRes] = await Promise.all([
      getLeadDetails(id),
      getLeadActivities(id),
      getLeadProducts(id)
    ])
    setLeadProducts(prodRes.success ? prodRes.data : [])
    
    if (leadRes.success) {
      setSelectedLead(leadRes.data)
      setEditNotes(leadRes.data.notes || "")
      setEditStatus(leadRes.data.status || "New")
      
      if (leadRes.data.next_follow_up_at) {
        // Convert UTC to local datetime string for input
        const d = new Date(leadRes.data.next_follow_up_at)
        setEditFollowUp(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16))
      } else {
        setEditFollowUp("")
      }
    }
    if (actRes.success) {
      setActivities(actRes.data)
    }
  }

  const handleOpenLead = async (id: number) => {
    setSelectedLeadId(id)
    setIsModalOpen(true)
    setModalLoading(true)
    await loadLeadData(id)
    setModalLoading(false)
  }

  const handleSaveNotes = async () => {
    if (!selectedLead) return
    setSaving(true)
    const res = await updateLeadNotes(selectedLead.id, editNotes)
    if (res.success) {
      toast({ title: "Notes updated" })
      await loadLeadData(selectedLead.id)
    } else {
      toast({ title: "Failed to update notes", variant: "destructive" })
    }
    setSaving(false)
  }

  const handleSaveStatus = async () => {
    if (!selectedLead) return
    setSaving(true)
    const res = await updateLeadStatus(selectedLead.id, editStatus)
    if (res.success) {
      toast({ title: "Status updated" })
      fetchLeads()
      fetchSummary()
      await loadLeadData(selectedLead.id)
    } else {
      toast({ title: "Failed to update status", variant: "destructive" })
    }
    setSaving(false)
  }

  const handleSaveFollowUp = async () => {
    if (!selectedLead) return
    setSaving(true)
    const dt = editFollowUp ? new Date(editFollowUp).toISOString() : null
    const res = await setLeadFollowUp(selectedLead.id, dt)
    if (res.success) {
      toast({ title: "Follow-up updated" })
      fetchLeads()
      fetchSummary()
      await loadLeadData(selectedLead.id)
    } else {
      toast({ title: "Failed to update follow-up", variant: "destructive" })
    }
    setSaving(false)
  }
  
  const handleAssign = async (staffId: string) => {
    if (!selectedLead) return
    setSaving(true)
    const res = await assignLead(selectedLead.id, staffId === 'unassigned' ? null : parseInt(staffId))
    if (res.success) {
      toast({ title: "Assignment updated" })
      fetchLeads()
      fetchSummary()
      await loadLeadData(selectedLead.id)
    } else {
      toast({ title: "Failed to assign lead", variant: "destructive" })
    }
    setSaving(false)
  }

  const handleConvert = async () => {
    if (!selectedLead) return
    setConverting(true)
    const res = await convertLeadToCustomer(selectedLead.id)
    if (res.success) {
      if (res.alreadyConverted) {
        toast({ title: "Lead was already converted to Customer #" + res.customerId })
      } else {
        toast({ title: "Successfully converted to Customer #" + res.customerId })
      }
      setIsConvertModalOpen(false)
      fetchLeads()
      fetchSummary()
      await loadLeadData(selectedLead.id)
    } else {
      toast({ title: res.message || "Failed to convert lead", variant: "destructive" })
    }
    setConverting(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-100 text-blue-800'
      case 'Assigned': return 'bg-purple-100 text-purple-800'
      case 'Contacted': return 'bg-yellow-100 text-yellow-800'
      case 'Follow Up': return 'bg-orange-100 text-orange-800'
      case 'Interested': return 'bg-emerald-100 text-emerald-800'
      case 'Converted': return 'bg-green-100 text-green-800'
      case 'Lost': case 'Invalid': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatFollowUp = (dateStr: string) => {
    const d = new Date(dateStr)
    const overdue = isPast(d) && !isToday(d)
    return <span className={overdue ? "text-red-600 font-medium" : "text-emerald-600"}>{format(d, 'dd MMM, p')}</span>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-muted-foreground uppercase">Total Leads</p>
            <p className="text-2xl font-bold">{summary.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-blue-600 uppercase">New</p>
            <p className="text-2xl font-bold">{summary.new_leads || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-purple-600 uppercase">My Leads</p>
            <p className="text-2xl font-bold">{summary.my_leads || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-orange-600 uppercase">Follow Up</p>
            <p className="text-2xl font-bold">{summary.follow_up || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-red-600 uppercase">Overdue</p>
            <p className="text-2xl font-bold">{summary.overdue || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            <p className="text-xs font-medium text-emerald-600 uppercase">Interested</p>
            <p className="text-2xl font-bold">{summary.interested || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search leads by name, phone, email..." 
            className="pl-8" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-32">
          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger><SelectValue placeholder="Assignment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="mine">My Leads</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32">
          <Select value={followUpFilter} onValueChange={setFollowUpFilter}>
            <SelectTrigger><SelectValue placeholder="Follow Up" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : leads.length === 0 ? (
        <div className="text-center p-8 border rounded-lg bg-gray-50/50">
          <p className="text-muted-foreground">No leads found.</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead No</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Source / Campaign</th>
                  <th className="px-4 py-3 font-medium">Assigned To</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Follow Up</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{lead.lead_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.phone || lead.email || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{lead.source || '-'}</div>
                      <div className="text-muted-foreground truncate max-w-[120px]">{lead.campaign || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{lead.assigned_staff_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{lead.next_follow_up_at ? formatFollowUp(lead.next_follow_up_at) : '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => handleOpenLead(lead.id)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {leads.map((lead) => (
              <Card key={lead.id} className="overflow-hidden" onClick={() => handleOpenLead(lead.id)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{lead.lead_number}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className="font-semibold">{lead.name}</div>
                  <div className="text-sm text-muted-foreground flex items-center mt-1">
                    <Phone className="h-3 w-3 mr-1" /> {lead.phone || '-'}
                  </div>
                  <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center"><Briefcase className="h-3 w-3 mr-1" /> {lead.assigned_staff_name || 'Unassigned'}</div>
                    <div className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {lead.next_follow_up_at ? formatFollowUp(lead.next_follow_up_at) : '-'}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
            <DialogTitle>Lead Details - {selectedLead?.lead_number}</DialogTitle>
            {selectedLead && (
              <div className="flex gap-2 items-center">
                {selectedLead.converted_sale_id ? (
                  <>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck className="w-3 h-3 mr-1" />
                      Customer #{selectedLead.converted_customer_id}
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Sale #{selectedLead.converted_sale_id}
                    </span>
                  </>
                ) : selectedLead.converted_customer_id ? (
                  <>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck className="w-3 h-3 mr-1" />
                      Customer #{selectedLead.converted_customer_id}
                    </span>
                    <Button size="sm" onClick={() => setIsJobCardModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                      Create Sale
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setIsConvertModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                    Convert to Customer
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {modalLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : selectedLead ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="details">Lead & Management</TabsTrigger>
                  <TabsTrigger value="history">Activity History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedLead.status)}`}>
                        {selectedLead.status}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Customer Name</p>
                      <p className="font-medium">{selectedLead.name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Contact</p>
                      <p className="text-sm">{selectedLead.phone || '-'}</p>
                      <p className="text-sm">{selectedLead.email || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Source / Campaign</p>
                      <p className="text-sm">{selectedLead.source || '-'} / {selectedLead.campaign || '-'}</p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-sm text-muted-foreground">Original Message</p>
                      <div className="text-sm p-3 bg-muted/50 rounded-md whitespace-pre-wrap">
                        {selectedLead.message || 'No message provided.'}
                      </div>
                    </div>
                    {leadProducts.length > 0 && (
                      <div className="space-y-2 md:col-span-2">
                        <p className="text-sm text-muted-foreground">Interested Products</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {leadProducts.map((lp) => (
                            <div key={lp.id} className="flex gap-3 rounded-md border p-3">
                              {lp.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={lp.image_url} alt={lp.product_name} className="h-20 w-20 shrink-0 rounded object-cover bg-muted" />
                              ) : (
                                <div className="h-20 w-20 shrink-0 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">No image</div>
                              )}
                              <div className="min-w-0 space-y-0.5 text-sm">
                                <p className="font-medium leading-tight break-words">{lp.product_name}</p>
                                {lp.variant_name && <p className="text-xs text-muted-foreground">Variant: {lp.variant_name}</p>}
                                {lp.sku && <p className="text-xs text-muted-foreground">SKU: {lp.sku}</p>}
                                <p>₹{Number(lp.price).toLocaleString("en-IN")}</p>
                                <p className={`text-xs ${lp.stock > 0 ? "text-green-700" : "text-red-600"}`}>Stock: {lp.stock}</p>
                                <p className="text-xs text-muted-foreground">Reviews unavailable</p>
                                <a href={lp.product_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View Product</a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Management</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Update Status</label>
                        <div className="flex gap-2">
                          <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                              {MUTABLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={handleSaveStatus} disabled={saving || editStatus === selectedLead.status}>Save</Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Assign Staff</label>
                        <Select value={selectedLead.assigned_to?.toString() || "unassigned"} onValueChange={handleAssign}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {staffList.map(s => (
                              <SelectItem key={s.id.toString()} value={s.id.toString()}>{s.name} ({s.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Next Follow Up</label>
                        <div className="flex gap-2">
                          <Input 
                            type="datetime-local" 
                            value={editFollowUp} 
                            onChange={(e) => setEditFollowUp(e.target.value)} 
                          />
                          <Button size="sm" onClick={handleSaveFollowUp} disabled={saving}>Set</Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <label className="text-sm font-medium">Internal Notes</label>
                      <Textarea 
                        placeholder="Add follow-up notes here..." 
                        className="min-h-[100px]"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={handleSaveNotes} disabled={saving || editNotes === (selectedLead.notes || "")}>
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="history" className="space-y-4">
                  {activities.length === 0 ? (
                    <div className="text-center p-8 text-muted-foreground">No activity history.</div>
                  ) : (
                    <div className="space-y-4">
                      {activities.map(act => (
                        <div key={act.id} className="flex gap-4 p-3 border rounded-lg bg-muted/20">
                          <div className="mt-1"><ActivityIcon className="h-4 w-4 text-muted-foreground" /></div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-medium">
                                {act.staff_name || 'System'} <span className="text-muted-foreground font-normal ml-1">
                                  {act.activity_type === 'CUSTOMER_CONVERTED' && `converted lead to customer`}
                                  {act.activity_type === 'SALE_CREATED' && act.note}
                                  {act.activity_type === 'STATUS_CHANGED' && `changed status from ${act.old_status} to ${act.new_status}`}
                                  {act.activity_type === 'ASSIGNED' && `assigned lead to ${act.new_assigned_name}`}
                                  {act.activity_type === 'UNASSIGNED' && `unassigned lead from ${act.old_assigned_name}`}
                                  {act.activity_type === 'NOTE_ADDED' && `added a note`}
                                  {act.activity_type === 'FOLLOW_UP_SET' && `set follow up`}
                                  {act.activity_type === 'FOLLOW_UP_UPDATED' && `updated follow up`}
                                </span>
                              </p>
                              <span className="text-xs text-muted-foreground">{format(new Date(act.created_at), 'dd MMM, p')}</span>
                            </div>
                            {act.note && act.activity_type !== 'SALE_CREATED' && (
                              <p className="mt-1 text-xs text-muted-foreground bg-white p-2 rounded border">{act.note}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isConvertModalOpen} onOpenChange={setIsConvertModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert this lead to a customer?</DialogTitle>
            <DialogDescription>
              An existing customer will be reused if a matching customer is found based on phone number or email. This action will not create a sale.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2 mt-4 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Lead Number:</span>
                <span className="font-medium">{selectedLead.lead_number}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{selectedLead.name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium">{selectedLead.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{selectedLead.email || 'N/A'}</span>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 gap-2">
            <Button variant="outline" onClick={() => setIsConvertModalOpen(false)} disabled={converting}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleConvert} disabled={converting}>
              {converting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Convert to Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {isJobCardModalOpen && (
        <JobCardModal
          isOpen={isJobCardModalOpen}
          onClose={() => {
            setIsJobCardModalOpen(false)
            if (selectedLeadId) {
              loadLeadData(selectedLeadId)
              fetchLeads()
              fetchSummary()
            }
          }}
          initialCustomer={selectedLead?.converted_customer_id ? {
            id: selectedLead.converted_customer_id,
            name: selectedLead.name,
            phone: selectedLead.phone
          } : null}
          crmLeadId={selectedLead?.id}
          initialProducts={leadProducts}
        />
      )}
    </div>
  )
}
