import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFcmToken } from "../hooks/useFcmToken";
import { useOneSignal } from "../hooks/useOneSignal";
import AddToHomeScreenPrompt from "./AddToHomeScreenPrompt";
import DisplayNameModal from "./DisplayNameModal";
import DuplicateEventsModal from "./DuplicateEventsModal";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-purple-100 text-purple-700" },
  trainer: { label: "Trainer", className: "bg-green-100 text-green-700" },
  member: { label: "Member", className: "bg-blue-100 text-blue-700" },
  user: { label: "User", className: "bg-gray-100 text-gray-600" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, appUser, isTrainer, isMember, isAdmin, signOut, updateDisplayName } = useAuth();
  const location = useLocation();

  useOneSignal(user?.uid ?? null, isTrainer, user?.email ?? null);
  useFcmToken(user?.uid ?? null, isTrainer);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);

  const displayName = appUser?.displayName || user?.displayName || "";

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

  function mobileIconClass(path: string) {
    return `rounded-lg p-2 transition ${
      isActive(path)
        ? "text-blue-600"
        : "text-gray-400 hover:text-gray-600"
    }`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="relative z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <img src="/IHN.png" alt="IHN Logo" className="h-14 w-14" />
              <span className="hidden sm:inline">Training Schedule</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex md:gap-1">
              <Link to="/" className={navLinkClass("/")}>Team Availability</Link>

              {isMember && (
                <Link to="/schedule" className={navLinkClass("/schedule")}>My Schedule</Link>
              )}

              {isTrainer && (
                <>
                  <div className="mx-2 w-px self-stretch bg-gray-200" />
                  <Link to="/admin/users" className={navLinkClass("/admin/users")}>Users</Link>
                  <Link to="/admin/trainers" className={navLinkClass("/admin/trainers")}>Trainers</Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin/events" className={navLinkClass("/admin/events")}>Events</Link>
                      <Link to="/admin/settings" className={navLinkClass("/admin/settings")}>Settings</Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right side: mobile icons + hamburger, desktop user info */}
          <div className="flex items-center gap-0.5 md:hidden">
            <Link to="/" className={mobileIconClass("/")} aria-label="Home">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </Link>

            {isMember && (
              <Link to="/schedule" className={mobileIconClass("/schedule")} aria-label="My Schedule">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </Link>
            )}

            {isTrainer && (
              <>
                <div className="mx-0.5 h-5 w-px bg-gray-200" />
                <Link to="/admin/users" className={mobileIconClass("/admin/users")} aria-label="Users">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </Link>
                <Link to="/admin/trainers" className={mobileIconClass("/admin/trainers")} aria-label="Trainers">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </Link>
                {isAdmin && (
                  <>
                    <Link to="/admin/events" className={mobileIconClass("/admin/events")} aria-label="Events">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                    </Link>
                    <Link to="/admin/settings" className={mobileIconClass("/admin/settings")} aria-label="Settings">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  </>
                )}
              </>
            )}

            {/* Mobile account menu */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="ml-0.5 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
              aria-label="Account menu"
            >
              {mobileOpen ? (
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          {/* Desktop user menu */}
          {user && (
            <div className="relative hidden md:block">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-100"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                aria-label="User menu"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700">
                  {displayName || "Anonymous"}
                </span>
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
                <svg
                  className={`h-4 w-4 text-gray-500 transition ${userMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                    aria-hidden
                  />
                  <div
                    className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-xl border border-gray-100 bg-white py-2 shadow-lg"
                    role="menu"
                  >
                    <button
                      onClick={() => { setProfileModalOpen(true); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                      role="menuitem"
                    >
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Edit profile
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setDuplicateModalOpen(true); setUserMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                        role="menuitem"
                      >
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                        </svg>
                        Duplicate events
                      </button>
                    )}
                    <button
                      onClick={() => { signOut(); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                      role="menuitem"
                    >
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H4.5" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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
          <div className="modal-panel absolute left-0 right-0 z-20 border-t border-gray-200 bg-white px-4 pb-4 pt-2 shadow-lg md:hidden">
            {user && (
              <div className="flex flex-col gap-2">
                {/* Line 1: Profile picture, display name, and title */}
                <div className="flex items-center gap-2">
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium text-gray-700">
                    {displayName || "Anonymous"}
                  </span>
                  {badge && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                {/* Line 2: Edit profile */}
                <button
                  onClick={() => { setProfileModalOpen(true); setMobileOpen(false); }}
                  className="flex items-center gap-2 rounded-lg p-2 text-left text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                >
                  <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Edit profile
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { setDuplicateModalOpen(true); setMobileOpen(false); }}
                    className="flex items-center gap-2 rounded-lg p-2 text-left text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                    Duplicate events
                  </button>
                )}
                {/* Line 3: Sign out */}
                <button
                  onClick={() => { signOut(); setMobileOpen(false); }}
                  className="flex items-center gap-2 rounded-lg p-2 text-left text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                >
                  <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H4.5" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}

        <DisplayNameModal
          open={profileModalOpen}
          currentName={displayName}
          onClose={() => setProfileModalOpen(false)}
          onSave={updateDisplayName}
        />
        <DuplicateEventsModal
          open={duplicateModalOpen}
          onClose={() => setDuplicateModalOpen(false)}
        />
      </nav>

      {isTrainer && <AddToHomeScreenPrompt />}

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
