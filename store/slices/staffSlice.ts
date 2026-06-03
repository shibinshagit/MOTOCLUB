import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface Staff {
  id: number
  name: string
  phone: string
  email?: string
  role?: "admin" | "staff"
  position: string
  salary: number
  salary_date: string
  joined_on: string
  age?: number
  id_card_number?: string
  address?: string
  is_active: boolean
  device_id: number
  company_id: number
  created_by: number
  created_at: string
  updated_at: string
}

interface StaffState {
  staff: Staff[]
  activeStaff: Staff | null
  isLoading: boolean
  error: string | null
  lastFetch: number | null
}

const initialState: StaffState = {
  staff: [],
  activeStaff: null,
  isLoading: false,
  error: null,
  lastFetch: null,
}

const staffSlice = createSlice({
  name: "staff",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    setStaff: (state, action: PayloadAction<Staff[]>) => {
      state.staff = action.payload
      state.activeStaff = action.payload.find((member) => member.is_active) || null
      state.lastFetch = Date.now()
      state.error = null
    },
    addStaff: (state, action: PayloadAction<Staff>) => {
      state.staff.push(action.payload)
      // If this is the first active staff or no active staff exists, set as active
      if (action.payload.is_active && !state.activeStaff) {
        state.activeStaff = action.payload
      }
    },
    activateStaff: (state, action: PayloadAction<{ staffId: number; allStaff: Staff[] }>) => {
      const { staffId, allStaff } = action.payload

      // Update all staff data
      state.staff = allStaff

      // Set the new active staff
      state.activeStaff = allStaff.find((member) => member.id === staffId && member.is_active) || null
    },
    updateStaff: (state, action: PayloadAction<Staff>) => {
      const updatedStaff = action.payload
      const staffIndex = state.staff.findIndex((member) => member.id === updatedStaff.id)

      if (staffIndex !== -1) {
        state.staff[staffIndex] = updatedStaff

        // Update active staff if this is the active one
        if (state.activeStaff?.id === updatedStaff.id) {
          state.activeStaff = updatedStaff.is_active ? updatedStaff : null
        }
      }
    },
    removeStaff: (state, action: PayloadAction<number>) => {
      const staffId = action.payload
      state.staff = state.staff.filter((member) => member.id !== staffId)

      // Update active staff if we removed the active one
      if (state.activeStaff?.id === staffId) {
        state.activeStaff = state.staff.find((member) => member.is_active) || null
      }
    },
    clearStaff: (state) => {
      state.staff = []
      state.activeStaff = null
      state.error = null
      state.lastFetch = null
    },
  },
})

export const { setLoading, setError, setStaff, addStaff, activateStaff, updateStaff, removeStaff, clearStaff } =
  staffSlice.actions

// Selectors
export const selectStaff = (state: { staff: StaffState }) => state.staff.staff
export const selectActiveStaff = (state: { staff: StaffState }) => state.staff.activeStaff
export const selectStaffLoading = (state: { staff: StaffState }) => state.staff.isLoading
export const selectStaffError = (state: { staff: StaffState }) => state.staff.error
export const selectStaffLastFetch = (state: { staff: StaffState }) => state.staff.lastFetch

export default staffSlice.reducer
