"use client"

import React, { useState, useEffect, useCallback } from "react"
import { 
  getLeadFollowUps, 
  createLeadFollowUp, 
  completeLeadFollowUp, 
  rescheduleLeadFollowUp,
  LeadFollowUpRecord 
} from "@/app/actions/lead-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  CheckCircle, 
  Plus, 
  AlertCircle, 
  XCircle, 
  FileText, 
  User, 
  Loader2,
  CalendarCheck2,
  History,
  RotateCcw
} from "lucide-react"
import { format, isPast, isToday } from "date-fns"

interface LeadFollowUpsSectionProps {
  leadId: number
  onFollowUpChanged?: () => void
}

export function LeadFollowUpsSection({ leadId, onFollowUpChanged }: LeadFollowUpsSectionProps) {
  const { toast } = useToast()
  const [followUps, setFollowUps] = useState<LeadFollowUpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Forms Visibility
  const [showNewForm, setShowNewForm] = useState(false)
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [showRescheduleForm, setShowRescheduleForm] = useState(false)

  // New Follow-up fields
  const [newDateTime, setNewDateTime] = useState("")
  const [newNote, setNewNote] = useState("")

  // Complete Follow-up fields
  const [outcomeNote, setOutcomeNote] = useState("")
  const [scheduleNextImmediately, setScheduleNextImmediately] = useState(false)
  const [nextDateTime, setNextDateTime] = useState("")
  const [nextNote, setNextNote] = useState("")

  // Reschedule fields
  const [rescheduleDateTime, setRescheduleDateTime] = useState("")
  const [rescheduleNote, setRescheduleNote] = useState("")

  const loadFollowUps = useCallback(async () => {
    setLoading(true)
    const res = await getLeadFollowUps(leadId)
    if (res.success && res.data) {
      setFollowUps(res.data)
    }
    setLoading(false)
  }, [leadId])

  useEffect(() => {
    loadFollowUps()
  }, [loadFollowUps])

  const activeFollowUp = followUps.find((f) => f.status === "scheduled")
  const historyFollowUps = followUps.filter((f) => f.status !== "scheduled")

  // Handle Create New Follow-Up
  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDateTime) {
      toast({ title: "Please pick a date & time", variant: "destructive" })
      return
    }

    setActionLoading(true)
    const res = await createLeadFollowUp({
      leadId,
      scheduledAt: newDateTime,
      note: newNote
    })

    if (res.success) {
      toast({ title: "Follow-up scheduled", description: `Set for ${format(new Date(newDateTime), "dd MMM yyyy, p")}` })
      setNewDateTime("")
      setNewNote("")
      setShowNewForm(false)
      await loadFollowUps()
      onFollowUpChanged?.()
    } else {
      toast({ title: "Failed to schedule", description: res.message, variant: "destructive" })
    }
    setActionLoading(false)
  }

  // Handle Complete / Took Follow-Up
  const handleCompleteFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeFollowUp) return

    if (!outcomeNote.trim()) {
      toast({ title: "Outcome note required", description: "Please record what was discussed on this follow-up.", variant: "destructive" })
      return
    }

    if (scheduleNextImmediately && !nextDateTime) {
      toast({ title: "Please select next follow-up date & time", variant: "destructive" })
      return
    }

    setActionLoading(true)
    const res = await completeLeadFollowUp({
      followUpId: activeFollowUp.id,
      outcomeNote: outcomeNote.trim(),
      status: "completed",
      nextScheduledAt: scheduleNextImmediately ? nextDateTime : null,
      nextNote: scheduleNextImmediately ? nextNote.trim() : null
    })

    if (res.success) {
      toast({ title: "Follow-up marked as Completed", description: "Outcome notes recorded successfully." })
      setOutcomeNote("")
      setScheduleNextImmediately(false)
      setNextDateTime("")
      setNextNote("")
      setShowCompleteForm(false)
      await loadFollowUps()
      onFollowUpChanged?.()
    } else {
      toast({ title: "Failed to complete", description: res.message, variant: "destructive" })
    }
    setActionLoading(false)
  }

  // Handle Mark Missed
  const handleMarkMissed = async (followUpId: number) => {
    const reason = window.prompt("Reason / note for missed follow-up (optional):", "Customer did not answer / unreachable")
    if (reason === null) return // cancelled prompt

    setActionLoading(true)
    const res = await completeLeadFollowUp({
      followUpId,
      outcomeNote: reason || "Follow-up missed / did not take",
      status: "missed"
    })

    if (res.success) {
      toast({ title: "Marked as Missed" })
      await loadFollowUps()
      onFollowUpChanged?.()
    } else {
      toast({ title: "Error", description: res.message, variant: "destructive" })
    }
    setActionLoading(false)
  }

  // Handle Reschedule
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeFollowUp) return

    if (!rescheduleDateTime) {
      toast({ title: "Please pick a new date & time", variant: "destructive" })
      return
    }

    setActionLoading(true)
    const res = await rescheduleLeadFollowUp({
      followUpId: activeFollowUp.id,
      newScheduledAt: rescheduleDateTime,
      note: rescheduleNote
    })

    if (res.success) {
      toast({ title: "Follow-up rescheduled", description: `Updated to ${format(new Date(rescheduleDateTime), "dd MMM yyyy, p")}` })
      setRescheduleDateTime("")
      setRescheduleNote("")
      setShowRescheduleForm(false)
      await loadFollowUps()
      onFollowUpChanged?.()
    } else {
      toast({ title: "Failed to reschedule", description: res.message, variant: "destructive" })
    }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground text-xs gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        <span>Loading follow-up details...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── SECTION 1: ACTIVE / CURRENT FOLLOW-UP ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-4 w-4 text-blue-600" />
            <h5 className="text-sm font-semibold text-slate-900">Current Follow-Up</h5>
          </div>
          {!activeFollowUp && !showNewForm && (
            <Button
              size="sm"
              onClick={() => {
                setShowNewForm(true)
                setShowCompleteForm(false)
                setShowRescheduleForm(false)
              }}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Schedule Follow-Up
            </Button>
          )}
        </div>

        {activeFollowUp ? (
          <div className="border border-blue-200 bg-blue-50/20 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm text-slate-900">
                  {format(new Date(activeFollowUp.scheduled_at), "EEEE, dd MMM yyyy • p")}
                </span>
              </div>
              <div>
                {isPast(new Date(activeFollowUp.scheduled_at)) && !isToday(new Date(activeFollowUp.scheduled_at)) ? (
                  <Badge variant="destructive" className="text-[11px] font-medium">Overdue</Badge>
                ) : isToday(new Date(activeFollowUp.scheduled_at)) ? (
                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium">Due Today</Badge>
                ) : (
                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium">Upcoming</Badge>
                )}
              </div>
            </div>

            {activeFollowUp.note ? (
              <div className="text-xs text-slate-700 bg-white/90 p-2.5 rounded-lg border border-blue-100/80 flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-600 block text-[10px] uppercase">Objective / Note</span>
                  <p className="mt-0.5 leading-relaxed">{activeFollowUp.note}</p>
                </div>
              </div>
            ) : null}

            {activeFollowUp.created_by_name ? (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>Scheduled by {activeFollowUp.created_by_name}</span>
              </div>
            ) : null}

            {/* Action Buttons (when not completing or rescheduling) */}
            {!showCompleteForm && !showRescheduleForm && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => setShowCompleteForm(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5 shadow-sm"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Mark as Took / Completed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRescheduleForm(true)
                    setRescheduleDateTime(activeFollowUp.scheduled_at ? new Date(activeFollowUp.scheduled_at).toISOString().slice(0, 16) : "")
                  }}
                  className="text-xs h-8 border-slate-300"
                >
                  <Clock className="h-3.5 w-3.5 mr-1 text-slate-500" />
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMarkMissed(activeFollowUp.id)}
                  disabled={actionLoading}
                  className="text-xs h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 ml-auto"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Mark as Missed
                </Button>
              </div>
            )}

            {/* Inline Form: Mark as Took / Completed */}
            {showCompleteForm && (
              <form onSubmit={handleCompleteFollowUp} className="mt-3 p-3.5 bg-white border border-emerald-200 rounded-lg space-y-3 shadow-xs">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs pb-1 border-b border-emerald-100">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Record Follow-Up Outcome & Notes</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    What was discussed on this follow-up? <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    placeholder="e.g. Spoke with customer. He is interested in the exhaust, asked to visit Saturday morning..."
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                    className="min-h-[75px] text-xs bg-slate-50/50"
                    autoFocus
                    required
                  />
                </div>

                {/* Optional: Immediately Schedule Next Follow-Up */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="schedule-next-toggle" className="text-xs font-medium cursor-pointer text-slate-700">
                      Schedule Next Follow-Up now?
                    </Label>
                    <Switch
                      id="schedule-next-toggle"
                      checked={scheduleNextImmediately}
                      onCheckedChange={setScheduleNextImmediately}
                    />
                  </div>

                  {scheduleNextImmediately && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-blue-50/40 rounded-md border border-blue-100">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-slate-700">Next Date & Time</Label>
                        <DateTimePicker
                          value={nextDateTime}
                          onChange={setNextDateTime}
                          placeholder="Select next date & time"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-slate-700">Next Follow-Up Objective (Optional)</Label>
                        <Input
                          placeholder="e.g. Confirm fitting slot..."
                          value={nextNote}
                          onChange={(e) => setNextNote(e.target.value)}
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompleteForm(false)}
                    disabled={actionLoading}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={actionLoading}
                    className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                    Save & Complete Follow-Up
                  </Button>
                </div>
              </form>
            )}

            {/* Inline Form: Reschedule */}
            {showRescheduleForm && (
              <form onSubmit={handleReschedule} className="mt-3 p-3.5 bg-white border border-blue-200 rounded-lg space-y-3 shadow-xs">
                <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-xs pb-1 border-b border-blue-100">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Reschedule Follow-Up</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      New Date & Time <span className="text-red-500">*</span>
                    </Label>
                    <DateTimePicker
                      value={rescheduleDateTime}
                      onChange={setRescheduleDateTime}
                      placeholder="Pick new date & time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Reason / Updated Note</Label>
                    <Input
                      placeholder="e.g. Customer requested call after 6 PM..."
                      value={rescheduleNote}
                      onChange={(e) => setRescheduleNote(e.target.value)}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRescheduleForm(false)}
                    disabled={actionLoading}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={actionLoading}
                    className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Update Schedule
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Empty Active State or New Follow-up Form */
          <div>
            {showNewForm ? (
              <form onSubmit={handleCreateFollowUp} className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-blue-100">
                  <div className="flex items-center gap-1.5 text-blue-900 font-semibold text-xs">
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span>Schedule New Follow-Up</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Date & Time <span className="text-red-500">*</span>
                    </Label>
                    <DateTimePicker
                      value={newDateTime}
                      onChange={setNewDateTime}
                      placeholder="Pick date & time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Objective / Follow-Up Note</Label>
                    <Input
                      placeholder="e.g. Call customer for quote confirmation..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewForm(false)}
                    disabled={actionLoading}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={actionLoading}
                    className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Calendar className="h-3.5 w-3.5 mr-1" />}
                    Save Follow-Up
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">No Pending Follow-Up</p>
                    <p className="text-[11px] text-muted-foreground">All previous follow-ups are completed. Schedule another whenever needed.</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowNewForm(true)}
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Schedule Follow-Up
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: FOLLOW-UP HISTORY & NOTES ── */}
      <div className="pt-2 border-t space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-Up History {historyFollowUps.length > 0 && `(${historyFollowUps.length})`}
            </h5>
          </div>
        </div>

        {historyFollowUps.length === 0 ? (
          <div className="text-center py-4 px-2 border border-dashed rounded-lg text-xs text-muted-foreground bg-slate-50/50">
            No completed follow-ups recorded yet. Completed follow-ups with notes will appear here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {historyFollowUps.map((item, idx) => {
              const isCompleted = item.status === "completed"
              const isMissed = item.status === "missed"

              return (
                <div
                  key={item.id}
                  className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 hover:border-slate-300 transition-colors shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle className="h-3 w-3" />
                          Took / Completed
                        </span>
                      ) : isMissed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                          <XCircle className="h-3 w-3" />
                          Missed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-800">
                          Cancelled
                        </span>
                      )}
                      <span className="font-semibold text-slate-800">
                        Follow-Up #{historyFollowUps.length - idx}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      Scheduled: {format(new Date(item.scheduled_at), "dd MMM yyyy, p")}
                    </div>
                  </div>

                  {/* Initial Scheduled Objective if any */}
                  {item.note && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-slate-600">Objective:</span> {item.note}
                    </div>
                  )}

                  {/* Outcome Note */}
                  {item.outcome_note && (
                    <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap">
                      <span className="font-semibold text-[10px] uppercase tracking-wider text-slate-500 block mb-0.5">
                        Follow-Up Note & Outcome:
                      </span>
                      {item.outcome_note}
                    </div>
                  )}

                  {/* Completed info footer */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-slate-100">
                    <span>
                      {item.completed_by_name ? `Recorded by ${item.completed_by_name}` : "Recorded"}
                    </span>
                    {item.completed_at && (
                      <span>{format(new Date(item.completed_at), "dd MMM yyyy 'at' p")}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

