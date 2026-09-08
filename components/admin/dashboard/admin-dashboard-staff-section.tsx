"use client"

import { Users, UserCheck, LogIn, Clock, ShieldCheck, User } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns"
import type { StaffSummaryData } from "@/app/actions/admin-dashboard-actions"

interface AdminDashboardStaffSectionProps {
  data: StaffSummaryData
}

function formatLastLogin(isoString: string | null): string {
  if (!isoString) return "Never"
  try {
    const date = parseISO(isoString)
    if (isToday(date)) {
      return `Today at ${format(date, "hh:mm a")}`
    }
    if (isYesterday(date)) {
      return `Yesterday at ${format(date, "hh:mm a")}`
    }
    return format(date, "dd MMM yyyy, hh:mm a")
  } catch {
    return "Recently"
  }
}

export default function AdminDashboardStaffSection({ data }: AdminDashboardStaffSectionProps) {
  return (
    <div className="space-y-4">
      {/* 3 Staff Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-gray-200 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Total Staff</p>
              <p className="text-xl font-bold text-gray-900">{data.totalStaff}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Active Staff</p>
              <p className="text-xl font-bold text-emerald-700">{data.activeStaff}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <LogIn className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Today's Logins</p>
              <p className="text-xl font-bold text-blue-700">{data.todayLogins}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Activity Table / List */}
      <Card className="border-gray-200 bg-white shadow-sm overflow-hidden">
        <CardHeader className="p-4 sm:p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-gray-900">
                Staff Activity & Attendance
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 mt-0.5">
                Recent logins and branch session activity
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs text-gray-500 font-normal">
              {data.activity.length} staff records
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {data.activity.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No staff activity records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3">Staff Name</th>
                    <th scope="col" className="px-4 py-3">Role</th>
                    <th scope="col" className="px-4 py-3 hidden sm:table-cell">Position</th>
                    <th scope="col" className="px-4 py-3">Last Login / Check-in</th>
                    <th scope="col" className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.activity.map((member) => {
                    const roleLower = (member.role || "staff").toLowerCase()
                    const isAdmin = roleLower === "admin"
                    const isPartner = roleLower === "partner"

                    return (
                      <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 font-semibold text-xs">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate">{member.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              isAdmin
                                ? "bg-violet-50 text-violet-700 border border-violet-200"
                                : isPartner
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {isAdmin ? (
                              <ShieldCheck className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            {isAdmin ? "Admin" : isPartner ? "Partner" : "Staff"}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-gray-500">
                          {member.position || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span>{formatLastLogin(member.lastLogin)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              member.isActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {member.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
