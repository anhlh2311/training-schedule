import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { AppUser } from "../../types";
import UserTable from "./UserTable";

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("lastLoginAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AppUser[] = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          uid: doc.id,
          email: d.email,
          displayName: d.displayName,
          photoURL: d.photoURL,
          role: d.role,
          createdAt: d.createdAt?.toDate(),
          lastLoginAt: d.lastLoginAt?.toDate(),
        };
      });
      setUsers(items);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
      <UserTable users={users} />
    </div>
  );
}
