import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";

const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const TrainersPage = lazy(() => import("./pages/admin/TrainersPage"));
const EventsPage = lazy(() => import("./pages/admin/EventsPage"));
const NotificationSettingsPage = lazy(() => import("./pages/admin/NotificationSettingsPage"));

function PageFallback() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute requiredRole="member">
                <Layout>
                  <SchedulePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredRole="trainer">
                <Layout>
                  <Suspense fallback={<PageFallback />}>
                    <UsersPage />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/trainers"
            element={
              <ProtectedRoute requiredRole="trainer">
                <Layout>
                  <Suspense fallback={<PageFallback />}>
                    <TrainersPage />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events"
            element={
              <ProtectedRoute requiredRole="admin">
                <Layout>
                  <Suspense fallback={<PageFallback />}>
                    <EventsPage />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute requiredRole="admin">
                <Layout>
                  <Suspense fallback={<PageFallback />}>
                    <NotificationSettingsPage />
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
