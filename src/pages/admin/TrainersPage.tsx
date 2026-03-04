import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { AppUser } from "../../types";
import UserTable from "./UserTable";

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "in", ["trainer", "admin"]),
      orderBy("lastLoginAt", "desc")
    );

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
      setTrainers(items);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
      <UserTable users={trainers} />
    </div>
  );
}
