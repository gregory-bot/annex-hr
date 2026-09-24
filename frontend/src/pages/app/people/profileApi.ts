import { useCallback, useEffect, useState } from 'react'
import type { ComplianceDoc, Employee, LeaveRequest } from '@/data/types'
import { api, ApiError, errorMessage, USE_MOCK_API } from '@/lib/api'
import { listEmployeeFiles, type EmployeeFile } from '@/lib/files'
import { isAdminLike } from '@/lib/rbac'
import type { useWorkspace } from '@/context/auth'
import type { OnboardingTaskState } from '../onboarding/api'

export type AccessLevel = 'full' | 'masked' | 'none'

export interface ProfileFields {
  preferredName?: string | null
  personalEmail?: string | null
  address?: string | null
  city?: string | null
  maritalStatus?: string | null
  nationality?: string | null
  emergencyName?: string | null
  emergencyRelationship?: string | null
  emergencyPhone?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  shifNumber?: string | null
  nssfNumber?: string | null
  passportNumber?: string | null
  ndaSignedAt?: string | null
  ndaSignature?: string | null
  updatedAt?: string | null
}

export interface EmployeeProfileData {
  employee: Employee
  department: { id: string; name: string; color: string } | null
  manager: { id: string; name: string; title: string; email: string } | null
  directReports: { id: string; name: string; title: string }[]
  profile: ProfileFields
  files: EmployeeFile[]
  complianceDocs: ComplianceDoc[]
  leaveRequests: LeaveRequest[]
  onboarding: { progress: number; requiredLeft: number; tasks: OnboardingTaskState[] }
  access: {
    isSelf: boolean
    canEdit: boolean
    canEditAll: boolean
    canUpload: boolean
    canViewFiles: boolean
    salary: boolean
    statutory: AccessLevel
    bank: AccessLevel
  }
}

type Workspace = ReturnType<typeof useWorkspace>

const maskValue = (v: string) => (v.length <= 3 ? v : '•'.repeat(Math.max(4, v.length - 3)) + v.slice(-3))

/** Mock mode: the same payload built from the in-browser demo data. */
export function mockProfile(ws: Workspace, id: string): EmployeeProfileData | null {
  const e = ws.employee(id)
  if (!e) return null
  const isSelf = ws.user.id === id
  const admin = isAdminLike(ws.role) && ws.role !== 'ceo'
  const full = isSelf || admin || ws.role === 'finance'
  const dept = ws.department(e.departmentId)
  const mgr = ws.employee(e.managerId)
  const done = Math.round((e.onboardingProgress / 100) * ws.onboardingTasks.length)
  const tasks = ws.onboardingTasks.map((t, i) => ({ ...t, completedAt: i < done ? e.startDate : null, file: null, values: null }))
  return {
    employee: { ...e, kraPin: full ? e.kraPin : maskValue(e.kraPin), nationalId: full ? e.nationalId : maskValue(e.nationalId) },
    department: dept ? { id: dept.id, name: dept.name, color: dept.color } : null,
    manager: mgr ? { id: mgr.id, name: mgr.name, title: mgr.title, email: mgr.email } : null,
    directReports: ws.employees.filter((r) => r.managerId === id && r.status !== 'Exited').map((r) => ({ id: r.id, name: r.name, title: r.title })),
    profile: {},
    files: [],
    complianceDocs: ws.complianceDocs.filter((d) => d.employeeId === id),
    leaveRequests: ws.leaveRequests.filter((l) => l.employeeId === id).sort((a, b) => b.start.localeCompare(a.start)),
    onboarding: { progress: e.onboardingProgress, requiredLeft: tasks.filter((t) => t.required && !t.completedAt).length, tasks },
    access: {
      isSelf,
      canEdit: isSelf,
      canEditAll: admin,
      canUpload: false,
      canViewFiles: isSelf || isAdminLike(ws.role) || (ws.role === 'manager' && e.managerId === ws.user.id),
      salary: isSelf || ['super_admin', 'company_admin', 'hr_officer', 'ceo', 'finance'].includes(ws.role),
      statutory: full ? 'full' : 'masked',
      bank: full ? 'full' : ws.role === 'manager' ? 'none' : 'masked',
    },
  }
}

export function useEmployeeProfile(id: string, ws: Workspace) {
  const [data, setData] = useState<EmployeeProfileData | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (USE_MOCK_API) {
      const d = mockProfile(ws, id)
      setData(d)
      if (!d) setError({ status: 404, message: 'Employee not found' })
      setLoading(false)
      return
    }
    try {
      setData(await api.get<EmployeeProfileData>(`/employees/${encodeURIComponent(id)}/profile`))
    } catch (err) {
      setError({ status: err instanceof ApiError ? err.status : 0, message: errorMessage(err) })
    } finally {
      setLoading(false)
    }
    // ws only matters in mock mode; re-fetching on every workspace refresh would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, setData, error, loading, reload }
}

/** Saves profile fields: self-service for your own profile, HR edits for anyone else. */
export function saveProfile(id: string, isSelf: boolean, patch: Record<string, string | null>) {
  return api.patch<EmployeeProfileData>(isSelf ? '/employees/me/profile' : `/employees/${encodeURIComponent(id)}/profile`, patch)
}

/** Files for the drawer; resolves to null when the viewer may not see them. */
export function useEmployeeFiles(id: string, enabled: boolean) {
  const [files, setFiles] = useState<EmployeeFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!enabled || USE_MOCK_API) return
    let cancelled = false
    setLoading(true)
    listEmployeeFiles(id)
      .then((f) => !cancelled && setFiles(f))
      .catch(() => !cancelled && setFiles(null))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id, enabled])
  return { files, loading }
}
