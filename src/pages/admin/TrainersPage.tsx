import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import type { AppUser } from "../../types";
import UserTable from "./UserTable";

interface Invite {
  email: string;
  role: string;
  createdAt: Date;
}

export default function TrainersPage() {
  const { isAdmin } = useAuth();
  const [trainers, setTrainers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "in", ["trainer", "admin"]),
      orderBy("lastLoginAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AppUser[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          role: data.role,
          createdAt: data.createdAt?.toDate(),
          lastLoginAt: data.lastLoginAt?.toDate(),
        };
      });
      setTrainers(items);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "users"), orderBy("lastLoginAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllUsers(snapshot.docs.map((d) => ({ uid: d.id, email: d.data().email } as AppUser)));
    });
    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "invites"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Invite[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          email: d.id,
          role: data.role,
          createdAt: data.createdAt?.toDate(),
        };
      });
      setInvites(items);
    });
    return unsubscribe;
  }, [isAdmin]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");

    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    if (allUsers.some((u) => u.email.toLowerCase() === email)) {
      setInviteError("This user has already signed in. Use the table below to change their role.");
      return;
    }

    if (invites.some((i) => i.email === email)) {
      setInviteError("This email already has a pending invite.");
      return;
    }

    setSubmitting(true);
    await setDoc(doc(db, "invites", email), {
      role: "trainer",
      createdAt: Timestamp.now(),
    });

    try {
      await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Email notification is best-effort
    }

    setInviteEmail("");
    setSubmitting(false);
  }

  async function handleRevokeInvite(email: string) {
    await deleteDoc(doc(db, "invites", email));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trainers</h1>
        <p className="mt-1 text-sm text-gray-400">
          {trainers.length} trainer{trainers.length !== 1 && "s"} and admin{trainers.length !== 1 && "s"}
        </p>
      </div>

      {isAdmin && (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold text-gray-900">
            Pre-register Trainer
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            Enter an email address to pre-assign the trainer role. When this
            person signs in with Google, they'll get trainer access immediately.
          </p>
          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError("");
              }}
              placeholder="trainer@example.com"
              required
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
            >
              {submitting ? "Adding..." : "Add Invite"}
            </button>
          </form>
          {inviteError && (
            <p className="mt-2 text-xs text-red-400">{inviteError}</p>
          )}

          {invites.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Pending Invites
              </h3>
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-100">
                {invites.map((inv, idx) => (
                  <div
                    key={inv.email}
                    className={`flex items-center justify-between px-4 py-3 ${idx !== invites.length - 1 ? "border-b border-gray-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{inv.email}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                        {inv.role}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeInvite(inv.email)}
                      className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 transition hover:bg-red-100 active:scale-[0.97]"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <UserTable users={trainers} />
    </div>
  );
}
