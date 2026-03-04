import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-purple-100 text-purple-700" },
  trainer: { label: "Trainer", className: "bg-green-100 text-green-700" },
  user: { label: "User", className: "bg-gray-100 text-gray-600" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, appUser, isTrainer, signOut } = useAuth();
  const location = useLocation();

  function isActive(path: string) {
    return location.pathname === path;
  }

  const badge = appUser ? ROLE_BADGE[appUser.role] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <img src="/IHN.png" alt="IHN Logo" className="h-8 w-8" />
              Training Schedule
            </Link>
            <div className="flex gap-1">
              <Link
                to="/"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive("/")
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                Dashboard
              </Link>

              {isTrainer && (
                <Link
                  to="/schedule"
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive("/schedule")
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  My Schedule
                </Link>
              )}

              {isTrainer && (
                <>
                  <div className="mx-2 w-px self-stretch bg-gray-200" />
                  <Link
                    to="/admin/users"
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive("/admin/users")
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    Users
                  </Link>
                  <Link
                    to="/admin/trainers"
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive("/admin/trainers")
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    Trainers
                  </Link>
                </>
              )}
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {user.displayName}
                </span>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <button
                onClick={signOut}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
