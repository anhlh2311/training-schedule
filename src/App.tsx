import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";
import UsersPage from "./pages/admin/UsersPage";
import TrainersPage from "./pages/admin/TrainersPage";
import EventsPage from "./pages/admin/EventsPage";

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
                  <UsersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/trainers"
            element={
              <ProtectedRoute requiredRole="trainer">
                <Layout>
                  <TrainersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events"
            element={
              <ProtectedRoute requiredRole="admin">
                <Layout>
                  <EventsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
