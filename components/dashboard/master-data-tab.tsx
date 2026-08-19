"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Database,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Flame,
  Users,
  Eye,
  Sparkles,
} from "lucide-react"
import TrendingInlineView from "@/components/products/trending-inline-view"
import StaffManagementView from "@/components/admin/staff-management-view"
import EcommerceBannerManagement from "@/components/master-data/ecommerce-banner-management"
import { CourierProfileModal } from "@/components/master-data/courier-profile-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  MASTER_DATA_CATEGORIES,
  getMasterDataCategoryLabel,
  getPackagingDefaultCost,
  type MasterDataCategory,
  type MasterDataInput,
  type MasterDataItem,
} from "@/lib/master-data"
import {
  createMasterDataItem,
  deleteMasterDataItem,
  getMasterDataItems,
  updateMasterDataItem,
} from "@/app/actions/master-data-actions"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"
import { cn } from "@/lib/utils"

interface MasterDataTabProps {
  userId: number
}

const CATEGORY_ICONS: Record<string, any> = {
  courier: Truck,
  manual_category: Database,
  trending: Flame,
  staff: Users,
  ecommerce_banner: Sparkles,
}


const EMPTY_FORM: MasterDataInput = {
  category: "courier",
  name: "",
  code: "",
  contactPhone: "",
  contactEmail: "",
  website: "",
  trackingUrlTemplate: "",
  notes: "",
  defaultCost: "",
  isActive: true,
  sortOrder: 0,
}

export default function MasterDataTab({ userId }: MasterDataTabProps) {
  const deviceId = useSelector(selectDeviceId) || 1
  const { toast } = useToast()

  const [activeCategory, setActiveCategory] = useState<MasterDataCategory>("courier")
  const [items, setItems] = useState<MasterDataItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<MasterDataItem | null>(null)
  const [form, setForm] = useState<MasterDataInput>(EMPTY_FORM)

  // Courier Profile Modal state
  const [selectedCourierIdForProfile, setSelectedCourierIdForProfile] = useState<number | null>(null)
  const [isCourierProfileOpen, setIsCourierProfileOpen] = useState(false)

  const handleOpenCourierProfile = (courierId: number) => {
    setSelectedCourierIdForProfile(courierId)
    setIsCourierProfileOpen(true)
  }

  const fetchItems = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    try {
      const result = await getMasterDataItems(deviceId)
      if (result.success) {
        setItems(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load master data")
      }
    } catch {
      notifyError(toast, "Failed to load master data")
    } finally {
      setLoading(false)
    }
  }, [deviceId, toast])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return items
      .filter((item) => item.category === activeCategory)
      .filter((item) => {
        if (!query) return true
        return (
          item.name.toLowerCase().includes(query) ||
          (item.code || "").toLowerCase().includes(query) ||
          (item.notes || "").toLowerCase().includes(query)
        )
      })
  }, [items, activeCategory, searchTerm])

  const openCreateDialog = () => {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM, category: activeCategory })
    setIsDialogOpen(true)
  }

  const openEditDialog = (item: MasterDataItem) => {
    setEditingItem(item)
    setForm({
      category: item.category as MasterDataCategory,
      name: item.name,
      code: item.code || "",
      contactPhone: item.contact_phone || "",
      contactEmail: item.contact_email || "",
      website: item.website || "",
      trackingUrlTemplate: item.tracking_url_template || "",
      notes: item.notes || "",
      defaultCost:
        getPackagingDefaultCost(item.metadata) != null
          ? String(getPackagingDefaultCost(item.metadata))
          : "",
      isActive: item.is_active !== false,
      sortOrder: item.sort_order || 0,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!deviceId) return
    setIsSaving(true)
    try {
      if (editingItem) {
        const result = await updateMasterDataItem(editingItem.id, deviceId, form)
        if (result.success) {
          notifySuccess(toast, "Master data updated")
          setIsDialogOpen(false)
          fetchItems()
        } else {
          notifyError(toast, result.message || "Failed to update master data")
        }
      } else {
        const result = await createMasterDataItem(deviceId, userId, form)
        if (result.success) {
          notifySuccess(toast, "Master data created")
          setIsDialogOpen(false)
          fetchItems()
        } else {
          notifyError(toast, result.message || "Failed to create master data")
        }
      }
    } catch {
      notifyError(toast, "Failed to save master data")
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingItem || !deviceId) return
    setIsSaving(true)
    try {
      const result = await deleteMasterDataItem(deletingItem.id, deviceId)
      if (result.success) {
        notifySuccess(toast, "Master data deleted")
        setIsDeleteOpen(false)
        setDeletingItem(null)
        fetchItems()
      } else {
        notifyError(toast, result.message || "Failed to delete master data")
      }
    } catch {
      notifyError(toast, "Failed to delete master data")
    } finally {
      setIsSaving(false)
    }
  }

  const activeMeta = MASTER_DATA_CATEGORIES.find((category) => category.id === activeCategory)
  const ActiveIcon = CATEGORY_ICONS[activeCategory] || Database

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Master Data</h1>
          <p className="text-sm text-slate-500">
            Manage reusable reference data for sales, shipping, and operations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Categories</p>
          </div>
          <div className="p-2">
            {MASTER_DATA_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.id] || Database
              const count = items.filter((item) => item.category === category.id).length
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    "mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    activeCategory === category.id
                      ? "bg-violet-50 text-violet-700"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{category.label}</span>
                    {category.id !== "trending" && category.id !== "staff" && (
                      <span className="block text-[11px] opacity-70">{count} item{count === 1 ? "" : "s"}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {activeCategory === "trending" ? (
            <TrendingInlineView userId={userId} />
          ) : activeCategory === "staff" ? (
            <StaffManagementView userId={userId} />
          ) : activeCategory === "ecommerce_banner" ? (
            <EcommerceBannerManagement items={items} deviceId={deviceId} userId={userId} onRefresh={fetchItems} />
          ) : (

            <>
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-violet-700 shadow-sm">
                    <ActiveIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{activeMeta?.label}</h2>
                    <p className="text-xs text-slate-500">{activeMeta?.description}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search..."
                      className="h-8 w-44 border-slate-200 bg-white pl-8 text-xs"
                    />
                  </div>
                  <Button size="sm" className="h-8" onClick={openCreateDialog}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading master data...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm font-medium text-slate-800">No {activeMeta?.label.toLowerCase()} yet</p>
                  <p className="mt-1 text-xs text-slate-500">Add your first entry to use it on sales and shipping.</p>
                  <Button size="sm" className="mt-4" onClick={openCreateDialog}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add {getMasterDataCategoryLabel(activeCategory)}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-2.5 text-left">Name</th>
                        {activeCategory === "courier" ? (
                          <>
                            <th className="px-4 py-2.5 text-left">Code</th>
                            <th className="px-4 py-2.5 text-left">Contact</th>
                            <th className="px-4 py-2.5 text-left">Tracking URL</th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-2.5 text-left">Default cost</th>
                            <th className="px-4 py-2.5 text-left">Notes</th>
                          </>
                        )}
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-b border-slate-200",
                            index % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                          )}
                        >
                          <td className="px-4 py-3">
                            <p
                              className={cn(
                                "font-semibold text-slate-900",
                                activeCategory === "courier" && "cursor-pointer hover:text-blue-600 hover:underline"
                              )}
                              onClick={() => activeCategory === "courier" && handleOpenCourierProfile(item.id)}
                            >
                              {item.name}
                            </p>
                            {item.contact_phone && activeCategory === "courier" && (
                              <p className="text-xs text-slate-500 font-normal mt-0.5">{item.contact_phone}</p>
                            )}
                            {item.notes && activeCategory === "courier" ? (
                              <p className="text-[11px] text-slate-400">{item.notes}</p>
                            ) : null}
                          </td>
                          {activeCategory === "courier" ? (
                            <>
                              <td className="px-4 py-3 text-slate-700">{item.code || "—"}</td>
                              <td className="px-4 py-3 text-slate-700">
                                <div className="space-y-0.5 text-xs">
                                  {item.contact_phone ? <p>{item.contact_phone}</p> : null}
                                  {item.contact_email ? <p>{item.contact_email}</p> : null}
                                  {!item.contact_phone && !item.contact_email ? "—" : null}
                                </div>
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-700">
                                {item.tracking_url_template || "—"}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-slate-700">
                                {getPackagingDefaultCost(item.metadata) != null
                                  ? Number(getPackagingDefaultCost(item.metadata)).toFixed(2)
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{item.notes || "—"}</td>
                            </>
                          )}
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                item.is_active !== false
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-100 text-slate-600",
                              )}
                            >
                              {item.is_active !== false ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end items-center gap-1.5">
                              {activeCategory === "courier" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs px-2.5"
                                  onClick={() => handleOpenCourierProfile(item.id)}
                                  title="View Partner Profile & Earnings"
                                >
                                  <Eye className="mr-1 h-4 w-4 text-blue-600" />
                                  View
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setDeletingItem(item)
                                  setIsDeleteOpen(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit master data" : "Add master data"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as MasterDataCategory }))}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {MASTER_DATA_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Courier or packaging name"
                />
              </div>

              {form.category === "courier" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Code</Label>
                    <Input
                      value={form.code || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                      placeholder="Short code"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={form.contactPhone || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input
                      value={form.contactEmail || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input
                      value={form.website || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Tracking URL template</Label>
                    <Input
                      value={form.trackingUrlTemplate || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, trackingUrlTemplate: e.target.value }))}
                      placeholder="https://carrier.com/track/{tracking_id}"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Default cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.defaultCost || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, defaultCost: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 border-t pt-3">
              <input
                type="checkbox"
                id="is_active"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="is_active" className="text-xs font-medium text-slate-700">
                Active
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <DialogTitle>Delete master data item</DialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletingItem?.name}&quot;? Existing sales keep the saved courier name snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CourierProfileModal
        courierId={selectedCourierIdForProfile}
        isOpen={isCourierProfileOpen}
        onClose={() => setIsCourierProfileOpen(false)}
      />
    </div>
  )
}
