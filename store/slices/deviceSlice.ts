import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface DeviceState {
  id: number | null
  name: string | null
  currency: string
  logo_url: string | null
  staff_pages: string | null
  admin_pages: string | null
  company: {
    id: number | null
    name: string | null
  } | null
  user: {
    id: number | null
    name: string | null
    email: string | null
    token: string | null
    role: string | null
  } | null
  isLoading: boolean
  error: string | null
}

const initialState: DeviceState = {
  id: null,
  name: null,
  currency: "AED",
  logo_url: null,
  staff_pages: null,
  admin_pages: null,
  company: null,
  user: null,
  isLoading: false,
  error: null,
}

const DEVICE_STATE_STORAGE_VERSION = 2

const hasBrowserStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined"

function normalizeStoredState(raw: Partial<DeviceState> & { company?: { logo_url?: string | null } | null; _version?: number }): DeviceState {
  const company = raw.company
    ? {
        id: raw.company.id ?? null,
        name: raw.company.name ?? null,
      }
    : null

  const storedVersion = raw._version ?? 1
  const logoUrl =
    raw.logo_url?.trim() ||
    (storedVersion < DEVICE_STATE_STORAGE_VERSION ? raw.company?.logo_url?.trim() : null) ||
    null

  return {
    id: raw.id ?? null,
    name: raw.name ?? null,
    currency: raw.currency ?? "AED",
    logo_url: logoUrl,
    staff_pages: raw.staff_pages ?? null,
    admin_pages: raw.admin_pages ?? null,
    company,
    user: raw.user ?? null,
    isLoading: raw.isLoading ?? false,
    error: raw.error ?? null,
  }
}

const loadStateFromStorage = (): DeviceState => {
  if (!hasBrowserStorage()) return initialState

  try {
    const serializedState = localStorage.getItem("deviceState")
    if (!serializedState) return initialState
    return normalizeStoredState(JSON.parse(serializedState))
  } catch {
    if (hasBrowserStorage()) localStorage.removeItem("deviceState")
    return initialState
  }
}

const saveStateToStorage = (state: DeviceState) => {
  if (!hasBrowserStorage()) return
  try {
    localStorage.setItem(
      "deviceState",
      JSON.stringify({
        ...state,
        _version: DEVICE_STATE_STORAGE_VERSION,
      }),
    )
  } catch {
    /* ignore */
  }
}

const deviceSlice = createSlice({
  name: "device",
  // The server and the browser must render the same initial tree. Reading
  // localStorage here makes the browser render an authenticated redirect
  // during hydration while the server renders the login form.
  initialState,
  reducers: {
    setDeviceData: (
      state,
      action: PayloadAction<{
        device: { id: number; name: string; currency: string; logo_url?: string | null; staff_pages?: string | null; admin_pages?: string | null }
        company: { id: number; name: string }
        user: { id: number; name: string; email: string; token: string; role?: string | null }
      }>,
    ) => {
      state.id = action.payload.device.id
      state.name = action.payload.device.name
      state.currency = action.payload.device.currency
      state.logo_url = action.payload.device.logo_url ?? null
      state.staff_pages = action.payload.device.staff_pages ?? null
      state.admin_pages = action.payload.device.admin_pages ?? null
      state.company = action.payload.company
      state.user = {
        id: action.payload.user.id,
        name: action.payload.user.name,
        email: action.payload.user.email,
        token: action.payload.user.token,
        role: action.payload.user.role ?? null,
      }
      state.error = null
      saveStateToStorage(state)
    },
    clearDeviceData: (state) => {
      state.id = null
      state.name = null
      state.currency = "AED"
      state.logo_url = null
      state.staff_pages = null
      state.admin_pages = null
      state.company = null
      state.user = null
      state.isLoading = false
      state.error = null

      if (hasBrowserStorage()) {
        try {
          localStorage.removeItem("deviceState")
        } catch {
          /* ignore */
        }
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
      saveStateToStorage(state)
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload
      saveStateToStorage(state)
    },
    loadFromStorage: (state) => {
      const storedState = loadStateFromStorage()
      state.id = storedState.id
      state.name = storedState.name
      state.currency = storedState.currency
      state.logo_url = storedState.logo_url
      state.staff_pages = storedState.staff_pages
      state.admin_pages = storedState.admin_pages
      state.company = storedState.company
      state.user = storedState.user
      state.isLoading = storedState.isLoading
      state.error = storedState.error
    },
    updateDeviceProfile: (
      state,
      action: PayloadAction<{
        name?: string
        currency?: string
        logo_url?: string | null
        staff_pages?: string | null
        admin_pages?: string | null
        company?: { id: number | null; name: string | null }
      }>,
    ) => {
      if (action.payload.name !== undefined) state.name = action.payload.name
      if (action.payload.currency !== undefined) state.currency = action.payload.currency
      if (action.payload.logo_url !== undefined) state.logo_url = action.payload.logo_url
      if (action.payload.staff_pages !== undefined) state.staff_pages = action.payload.staff_pages
      if (action.payload.admin_pages !== undefined) state.admin_pages = action.payload.admin_pages
      if (action.payload.company !== undefined) state.company = action.payload.company
      saveStateToStorage(state)
    },
  },
})

export const { setDeviceData, clearDeviceData, setLoading, setError, loadFromStorage, updateDeviceProfile } =
  deviceSlice.actions

export const selectDevice = (state: { device: DeviceState }) => state.device
export const selectDeviceId = (state: { device: DeviceState }) => state.device.id
export const selectDeviceName = (state: { device: DeviceState }) => state.device.name
export const selectDeviceCurrency = (state: { device: DeviceState }) => state.device.currency
export const selectDeviceLogo = (state: { device: DeviceState }) => state.device.logo_url
export const selectCompany = (state: { device: DeviceState }) => state.device.company
export const selectCompanyId = (state: { device: DeviceState }) => state.device.company?.id
export const selectCompanyName = (state: { device: DeviceState }) => state.device.company?.name
export const selectUser = (state: { device: DeviceState }) => state.device.user
export const selectUserId = (state: { device: DeviceState }) => state.device.user?.id
export const selectUserEmail = (state: { device: DeviceState }) => state.device.user?.email
export const selectUserName = (state: { device: DeviceState }) => state.device.user?.name
export const selectUserToken = (state: { device: DeviceState }) => state.device.user?.token
export const selectIsLoading = (state: { device: DeviceState }) => state.device.isLoading
export const selectError = (state: { device: DeviceState }) => state.device.error

export default deviceSlice.reducer
