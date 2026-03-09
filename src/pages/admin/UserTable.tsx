import type { AppUser } from "../../types";
import RoleActions from "./RoleActions";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-violet-50 text-violet-600" },
  trainer: { label: "Trainer", className: "bg-emerald-50 text-emerald-600" },
  member: { label: "Member", className: "bg-blue-50 text-blue-600" },
  user: { label: "User", className: "bg-slate-100 text-slate-500" },
};

interface UserTableProps {
  users: AppUser[];
}

export default function UserTable({ users }: UserTableProps) {
  if (users.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-400">No users found.</p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                User
              </th>
              <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Email
              </th>
              <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Role
              </th>
              <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Last Login
              </th>
              <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => {
              const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.user;
              return (
                <tr
                  key={u.uid}
                  className={`transition hover:bg-gray-50/70 ${idx !== users.length - 1 ? "border-b border-gray-50" : ""}`}
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt=""
                          className="h-9 w-9 rounded-full ring-2 ring-white"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-semibold text-gray-500">
                          {u.displayName?.[0] ?? "?"}
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {u.displayName || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                    {u.email}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                    {u.lastLoginAt?.toLocaleDateString() ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <RoleActions target={u} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="flex flex-col gap-3 md:hidden">
        {users.map((u) => {
          const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.user;
          return (
            <div
              key={u.uid}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                {u.photoURL ? (
                  <img
                    src={u.photoURL}
                    alt=""
                    className="h-11 w-11 rounded-full ring-2 ring-white"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-semibold text-gray-500">
                    {u.displayName?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {u.displayName || "—"}
                  </p>
                  <p className="truncate text-xs text-gray-400">{u.email}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
                <span className="text-[11px] text-gray-400">
                  Last login: {u.lastLoginAt?.toLocaleDateString() ?? "—"}
                </span>
                <RoleActions target={u} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
