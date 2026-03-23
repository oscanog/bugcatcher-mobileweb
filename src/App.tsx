import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider, getDefaultAppPath, useAuth } from './auth-context'
import { AppShell, AppViewport } from './components/layout'
import { NotificationProvider } from './features/notifications/context'
import { canViewRoute, findAppRoute } from './lib/access'
import { ThemeProvider } from './theme-context'
import {
  ChecklistBatchDetailPage,
  ChecklistPage,
  DashboardPage,
  DiscordLinksPage,
  ForgotPasswordPage,
  ForgotPasswordSuccessPage,
  ForgotPasswordVerifyPage,
  LandingPage,
  LoginPage,
  ManageUsersPage,
  NotificationsPage,
  OpenClawPage,
  OrganizationsPage,
  ProfilePage,
  ProjectDetailPage,
  ProjectsPage,
  ReportDetailPage,
  ReportsPage,
  SettingsPage,
  SignupPage,
  SuperAdminPage,
} from './pages'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <AppViewport>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route
                  path="/login"
                  element={
                    <GuestOnlyRoute>
                      <LoginPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <GuestOnlyRoute>
                      <SignupPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <GuestOnlyRoute>
                      <ForgotPasswordPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password/verify"
                  element={
                    <GuestOnlyRoute>
                      <ForgotPasswordVerifyPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password/success"
                  element={
                    <GuestOnlyRoute>
                      <ForgotPasswordSuccessPage />
                    </GuestOnlyRoute>
                  }
                />
                <Route
                  path="/app"
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<AppIndexRedirect />} />
                  <Route path="dashboard" element={<GuardedAppRoute path="/app/dashboard"><DashboardPage /></GuardedAppRoute>} />
                  <Route path="organizations" element={<GuardedAppRoute path="/app/organizations"><OrganizationsPage /></GuardedAppRoute>} />
                  <Route path="projects" element={<GuardedAppRoute path="/app/projects"><ProjectsPage /></GuardedAppRoute>} />
                  <Route path="projects/:projectId" element={<GuardedAppRoute path="/app/projects"><ProjectDetailPage /></GuardedAppRoute>} />
                  <Route path="reports" element={<GuardedAppRoute path="/app/reports"><ReportsPage /></GuardedAppRoute>} />
                  <Route path="reports/:issueId" element={<GuardedAppRoute path="/app/reports"><ReportDetailPage /></GuardedAppRoute>} />
                  <Route path="profile" element={<GuardedAppRoute path="/app/profile"><ProfilePage /></GuardedAppRoute>} />
                  <Route path="notifications" element={<GuardedAppRoute path="/app/notifications"><NotificationsPage /></GuardedAppRoute>} />
                  <Route path="super-admin" element={<GuardedAppRoute path="/app/super-admin"><SuperAdminPage /></GuardedAppRoute>} />
                  <Route path="openclaw" element={<GuardedAppRoute path="/app/openclaw"><OpenClawPage /></GuardedAppRoute>} />
                  <Route path="manage-users" element={<GuardedAppRoute path="/app/manage-users"><ManageUsersPage /></GuardedAppRoute>} />
                  <Route path="checklist" element={<GuardedAppRoute path="/app/checklist"><ChecklistPage /></GuardedAppRoute>} />
                  <Route path="checklist/batches/:batchId" element={<GuardedAppRoute path="/app/checklist"><ChecklistBatchDetailPage /></GuardedAppRoute>} />
                  <Route path="discord-links" element={<GuardedAppRoute path="/app/discord-links"><DiscordLinksPage /></GuardedAppRoute>} />
                  <Route path="settings" element={<GuardedAppRoute path="/app/settings"><SettingsPage /></GuardedAppRoute>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppViewport>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

function GuestOnlyRoute({ children }: { children: ReactElement }) {
  const { isBootstrapping, isAuthenticated, session } = useAuth()

  if (isBootstrapping) {
    return null
  }

  if (isAuthenticated) {
    return <Navigate to={getDefaultAppPath(session)} replace />
  }

  return children
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { isBootstrapping, isAuthenticated } = useAuth()

  if (isBootstrapping) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppIndexRedirect() {
  const { session } = useAuth()
  return <Navigate to={getDefaultAppPath(session)} replace />
}

function GuardedAppRoute({ path, children }: { path: string; children: ReactElement }) {
  const route = findAppRoute(path)
  const { session } = useAuth()

  if (route.requiresOrg && !session?.memberships.find((membership) => membership.org_id === session.activeOrgId)) {
    return <Navigate to="/app/organizations" replace />
  }

  if (!canViewRoute(session, route.key)) {
    return <Navigate to={getDefaultAppPath(session)} replace />
  }

  return children
}

export default App
