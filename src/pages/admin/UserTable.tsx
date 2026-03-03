import type { AppUser } from "../../types";
import RoleActions from "./RoleActions";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-purple-100 text-purple-700" },
  trainer: { label: "Trainer", className: "bg-green-100 text-green-700" },
  user: { label: "User", className: "bg-gray-100 text-gray-600" },
};

interface UserTableProps {
  users: AppUser[];
}

export default function UserTable({ users }: UserTableProps) {
  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">No users found.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              User
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Last Login
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((u) => {
            const badge = ROLE_BADGE[u.role];
            return (
              <tr key={u.uid} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      <img
                        src={u.photoURL}
                        alt=""
                        className="h-8 w-8 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                        {u.displayName?.[0] ?? "?"}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {u.displayName || "—"}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {u.email}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
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
  );
}
