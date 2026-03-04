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
      <div className="flex flex-wrap gap-1.5">
        {target.role === "user" && (currentRole === "admin" || currentRole === "trainer") && (
          <button
            onClick={() => prompt("trainer", "Make Trainer")}
            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
          >
            Make Trainer
          </button>
        )}

        {target.role === "trainer" && !isSelf && currentRole === "admin" && (
          <>
            <button
              onClick={() => prompt("user", "Remove Trainer")}
              className="rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-500 transition hover:bg-red-100"
            >
              Remove Trainer
            </button>
            <button
              onClick={() => prompt("admin", "Make Admin")}
              className="rounded-lg bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-100"
            >
              Make Admin
            </button>
          </>
        )}

        {target.role === "admin" && isSelf && (
          <button
            onClick={() => prompt("trainer", "Renounce Admin")}
            className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-600 transition hover:bg-amber-100"
          >
            Renounce Admin
          </button>
        )}
      </div>

      {confirm.open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            onClick={() => setConfirm({ open: false, newRole: "user", label: "" })}
          >
            <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
              className="modal-panel relative mx-0 w-full rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-sm sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
              <h2 className="text-lg font-semibold text-gray-900">
                {confirm.label}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {isSelf ? (
                  <>
                    Are you sure you want to renounce your admin privileges? You
                    will be demoted to <span className="font-medium text-gray-700">trainer</span>.
                  </>
                ) : (
                  <>
                    Change{" "}
                    <span className="font-medium text-gray-700">{target.displayName || target.email}</span>'s
                    role to <span className="font-medium text-gray-700">{confirm.newRole}</span>?
                  </>
                )}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() =>
                    setConfirm({ open: false, newRole: "user", label: "" })
                  }
                  disabled={updating}
                  className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 active:scale-[0.98] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={updating}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
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
