import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(path: string) {
    return location.pathname === path;
  }

  function navLinkClass(path: string) {
    return `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive(path)
        ? "bg-blue-50 text-blue-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;
  }

  const badge = appUser ? ROLE_BADGE[appUser.role] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="relative z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <img src="/IHN.png" alt="IHN Logo" className="h-8 w-8" />
              <span className="hidden sm:inline">Training Schedule</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex md:gap-1">
              <Link to="/" className={navLinkClass("/")}>Dashboard</Link>

              {isTrainer && (
                <Link to="/schedule" className={navLinkClass("/schedule")}>My Schedule</Link>
              )}

              {isTrainer && (
                <>
                  <div className="mx-2 w-px self-stretch bg-gray-200" />
                  <Link to="/admin/users" className={navLinkClass("/admin/users")}>Users</Link>
                  <Link to="/admin/trainers" className={navLinkClass("/admin/trainers")}>Trainers</Link>
                </>
              )}
            </div>
          </div>

          {/* Desktop user info */}
          {user && (
            <div className="hidden md:flex md:items-center md:gap-4">
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
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

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu panel — overlays content */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-10 bg-black/20 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
          </>
        )}
        {mobileOpen && (
          <div className="absolute left-0 right-0 z-20 border-t border-gray-200 bg-white px-4 pb-4 pt-2 shadow-lg md:hidden">
            <div className="flex flex-col gap-1">
              <Link to="/" className={navLinkClass("/")} onClick={() => setMobileOpen(false)}>
                Dashboard
              </Link>

              {isTrainer && (
                <Link to="/schedule" className={navLinkClass("/schedule")} onClick={() => setMobileOpen(false)}>
                  My Schedule
                </Link>
              )}

              {isTrainer && (
                <>
                  <div className="my-1 h-px bg-gray-200" />
                  <Link to="/admin/users" className={navLinkClass("/admin/users")} onClick={() => setMobileOpen(false)}>
                    Users
                  </Link>
                  <Link to="/admin/trainers" className={navLinkClass("/admin/trainers")} onClick={() => setMobileOpen(false)}>
                    Trainers
                  </Link>
                </>
              )}
            </div>

            {user && (
              <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                <div className="flex items-center gap-2">
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="h-8 w-8 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700">{user.displayName}</span>
                    {badge && (
                      <span className={`mt-0.5 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { signOut(); setMobileOpen(false); }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
