"use client"

import { useMemo } from "react"
import { useAppSelector } from "@/store/hooks"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import {
  canStaffAccessPage,
  isStaffAdmin,
  isStaffValueHidden,
  type StaffPageId,
  type StaffValueRestriction,
} from "@/lib/staff-restrictions"

export function useStaffRestrictions() {
  const activeStaff = useAppSelector(selectActiveStaff)

  return useMemo(
    () => ({
      activeStaff,
      isAdmin: isStaffAdmin(activeStaff),
      requiresStaffLogin: !activeStaff,
      hideCogs: isStaffValueHidden(activeStaff, "cogs"),
      hideStockCount: isStaffValueHidden(activeStaff, "stock_count"),
      canAccessPage: (page: StaffPageId) => canStaffAccessPage(activeStaff, page),
      isValueHidden: (value: StaffValueRestriction) => isStaffValueHidden(activeStaff, value),
    }),
    [activeStaff],
  )
}
