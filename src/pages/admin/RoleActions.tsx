import { useState } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import type { AppUser, UserRole } from "../../types";

interface RoleActionsProps {
  target: AppUser;
}

interface ConfirmState {
  open: boolean;
  newRole: UserRole;
  label: string;
}

export default function RoleActions({ target }: RoleActionsProps) {
  const { appUser } = useAuth();
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    newRole: "user",
    label: "",
  });
  const [updating, setUpdating] = useState(false);

  const isSelf = appUser?.uid === target.uid;
  const currentRole = appUser?.role;

  async function handleConfirm() {
    setUpdating(true);
    await updateDoc(doc(db, "users", target.uid), {
      role: confirm.newRole,
    });
    setUpdating(false);
    setConfirm({ open: false, newRole: "user", label: "" });
  }

  function prompt(newRole: UserRole, label: string) {
    setConfirm({ open: true, newRole, label });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {target.role === "user" && (currentRole === "admin" || currentRole === "trainer") && (
          <button
            onClick={() => prompt("trainer", "Make Trainer")}
            className="rounded-md bg-green-50 px-3 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100"
          >
            Make Trainer
          </button>
        )}

        {target.role === "trainer" && !isSelf && currentRole === "admin" && (
          <>
            <button
              onClick={() => prompt("user", "Remove Trainer")}
              className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
            >
              Remove Trainer
            </button>
            <button
              onClick={() => prompt("admin", "Make Admin")}
              className="rounded-md bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 transition hover:bg-purple-100"
            >
              Make Admin
            </button>
          </>
        )}

        {target.role === "admin" && isSelf && (
          <button
            onClick={() => prompt("trainer", "Renounce Admin")}
            className="rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
          >
            Renounce Admin
          </button>
        )}
      </div>

      {confirm.open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-gray-900">
                {confirm.label}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {isSelf ? (
                  <>
                    Are you sure you want to renounce your admin privileges? You
                    will be demoted to <strong>trainer</strong>.
                  </>
                ) : (
                  <>
                    Change{" "}
                    <strong>{target.displayName || target.email}</strong>'s
                    role to <strong>{confirm.newRole}</strong>?
                  </>
                )}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() =>
                    setConfirm({ open: false, newRole: "user", label: "" })
                  }
                  disabled={updating}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={updating}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {updating ? "Updating..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
