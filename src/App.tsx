import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AppShell, AppViewport } from './components/layout'
import { NotificationProvider } from './notifications-context'
import { ThemeProvider } from './theme-context'
import {
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
  ProjectsPage,
  ReportsPage,
  SettingsPage,
  SignupPage,
  SuperAdminPage,
} from './pages'

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <BrowserRouter>
          <AppViewport>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/forgot-password/verify" element={<ForgotPasswordVerifyPage />} />
              <Route path="/forgot-password/success" element={<ForgotPasswordSuccessPage />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="organizations" element={<OrganizationsPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="super-admin" element={<SuperAdminPage />} />
                <Route path="openclaw" element={<OpenClawPage />} />
                <Route path="manage-users" element={<ManageUsersPage />} />
                <Route path="checklist" element={<ChecklistPage />} />
                <Route path="discord-links" element={<DiscordLinksPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppViewport>
        </BrowserRouter>
      </NotificationProvider>
    </ThemeProvider>
  )
}

export default App
