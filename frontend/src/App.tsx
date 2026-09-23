import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PageSkeleton } from '@/components/shared/PageSkeleton'
import { useAuth } from '@/context/auth'
import { canAccess } from '@/lib/rbac'
import Forbidden from '@/pages/app/Forbidden'

const Landing = lazy(() => import('@/pages/landing/Landing'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Signup = lazy(() => import('@/pages/auth/Signup'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const AcceptInvite = lazy(() => import('@/pages/auth/AcceptInvite'))

const Dashboard = lazy(() => import('@/pages/app/Dashboard'))
const People = lazy(() => import('@/pages/app/People'))
const Departments = lazy(() => import('@/pages/app/Departments'))
const Onboarding = lazy(() => import('@/pages/app/Onboarding'))
const Leave = lazy(() => import('@/pages/app/Leave'))
const Attendance = lazy(() => import('@/pages/app/Attendance'))
const Timesheets = lazy(() => import('@/pages/app/Timesheets'))
const Payroll = lazy(() => import('@/pages/app/Payroll'))
const Performance = lazy(() => import('@/pages/app/Performance'))
const Surveys = lazy(() => import('@/pages/app/Surveys'))
const Compliance = lazy(() => import('@/pages/app/Compliance'))
const Cases = lazy(() => import('@/pages/app/Cases'))
const Offboarding = lazy(() => import('@/pages/app/Offboarding'))
const Documents = lazy(() => import('@/pages/app/Documents'))
const Reports = lazy(() => import('@/pages/app/Reports'))
const Settings = lazy(() => import('@/pages/app/Settings'))
const Notifications = lazy(() => import('@/pages/app/Notifications'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageSkeleton fullscreen />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function Guard({ module, children }: { module: string; children: React.ReactNode }) {
  const { role } = useAuth()
  return canAccess(role, module) ? <>{children}</> : <Forbidden />
}

const modules: [string, React.LazyExoticComponent<() => React.JSX.Element>][] = [
  ['people', People],
  ['departments', Departments],
  ['onboarding', Onboarding],
  ['leave', Leave],
  ['attendance', Attendance],
  ['timesheets', Timesheets],
  ['payroll', Payroll],
  ['performance', Performance],
  ['surveys', Surveys],
  ['compliance', Compliance],
  ['cases', Cases],
  ['offboarding', Offboarding],
  ['documents', Documents],
  ['reports', Reports],
  ['settings', Settings],
]

export default function App() {
  return (
    <Suspense fallback={<PageSkeleton fullscreen />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<PageSkeleton />}>
                <Dashboard />
              </Suspense>
            }
          />
          {modules.map(([key, Page]) => (
            <Route
              key={key}
              path={key}
              element={
                <Guard module={key}>
                  <Suspense fallback={<PageSkeleton />}>
                    <Page />
                  </Suspense>
                </Guard>
              }
            />
          ))}
          <Route
            path="notifications"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <Notifications />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound inApp />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
