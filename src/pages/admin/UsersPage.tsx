import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
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

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("lastLoginAt", "desc"));
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
      setUsers(items);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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

    if (users.some((u) => u.email.toLowerCase() === email)) {
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
      // Email notification is best-effort; invite is saved regardless
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">All Users</h1>
        <p className="text-sm text-gray-500">
          {users.length} user{users.length !== 1 && "s"} have signed in
        </p>
      </div>

      {isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Pre-register Trainer
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Enter an email address to pre-assign the trainer role. When this
            person signs in with Google, they'll get trainer access immediately.
          </p>
          <form onSubmit={handleInvite} className="mt-3 flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError("");
              }}
              placeholder="trainer@example.com"
              required
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Invite"}
            </button>
          </form>
          {inviteError && (
            <p className="mt-2 text-xs text-red-600">{inviteError}</p>
          )}

          {invites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Pending Invites
              </h3>
              <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {invites.map((inv) => (
                  <div
                    key={inv.email}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <span className="text-sm text-gray-900">{inv.email}</span>
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {inv.role}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRevokeInvite(inv.email)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
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

      <UserTable users={users} />
    </div>
  );
}
