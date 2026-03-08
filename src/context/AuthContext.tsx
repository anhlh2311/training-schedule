import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, googleProvider, db } from "../lib/firebase";
import type { AppUser, UserRole } from "../types";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  isTrainer: boolean;
  isEmbeddedBrowser: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const RETRYABLE_PATTERNS = [
  "unavailable",
  "resource-exhausted",
  "deadline-exceeded",
  "aborted",
  "internal",
  "quic",
  "network",
  "too many",
  "connection",
];

function isRetryable(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error).toLowerCase();
  const code = String((error as { code?: string })?.code ?? "").toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p) || code.includes(p));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

async function resolveInvitedRole(email: string): Promise<UserRole | null> {
  try {
    const inviteRef = doc(db, "invites", email.toLowerCase());
    const snap = await withRetry(() => getDoc(inviteRef));
    if (!snap.exists()) return null;
    const role = snap.data().role as UserRole;
    try {
      await withRetry(() => deleteDoc(inviteRef));
    } catch {
      // Invite cleanup failed -- admin can remove it manually
    }
    return role;
  } catch {
    return null;
  }
}

async function upsertUserDoc(firebaseUser: User): Promise<void> {
  const userRef = doc(db, "users", firebaseUser.uid);
  const snap = await withRetry(() => getDoc(userRef));

  if (snap.exists()) {
    await withRetry(() =>
      updateDoc(userRef, { lastLoginAt: Timestamp.now() })
    );
  } else {
    let role: UserRole = "user";

    if (firebaseUser.email === ADMIN_EMAIL) {
      role = "admin";
    } else if (firebaseUser.email) {
      const invitedRole = await resolveInvitedRole(firebaseUser.email);
      if (invitedRole) role = invitedRole;
    }

    await withRetry(() =>
      setDoc(userRef, {
        email: firebaseUser.email ?? "",
        displayName: firebaseUser.displayName ?? "",
        photoURL: firebaseUser.photoURL ?? "",
        role,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
      })
    );
  }
}

const EMBEDDED_BROWSER_PATTERNS = [
  "fban", "fbav", "instagram", "twitter", "linkedinapp", "whatsapp",
  "line", "kakaotalk", "slack", "wechat", "snapchat", "tiktok",
  "pinterest", "telegram", "messenger", "wv", "webview",
];

function isEmbeddedBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return EMBEDDED_BROWSER_PATTERNS.some((p) => ua.includes(p));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setAppUser(null);
        setLoading(false);
        return;
      }
      await upsertUserDoc(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setAppUser({
        uid: snap.id,
        email: data.email,
        displayName: data.displayName,
        photoURL: data.photoURL,
        role: data.role,
        createdAt: data.createdAt?.toDate(),
        lastLoginAt: data.lastLoginAt?.toDate(),
      });
    });

    return unsubscribe;
  }, [user]);

  const isAdmin = appUser?.role === "admin";
  const isTrainer = appUser?.role === "trainer" || appUser?.role === "admin";
  const isEmbeddedBrowserFlag = isEmbeddedBrowser();

  async function signInWithGoogle() {
    if (isEmbeddedBrowserFlag) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === "auth/popup-closed-by-user") return;
      throw error;
    }
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  async function updateDisplayName(displayName: string) {
    if (!user) return;
    const trimmed = displayName.trim();
    if (!trimmed) return;

    const userRef = doc(db, "users", user.uid);
    await withRetry(() => updateDoc(userRef, { displayName: trimmed }));
    await updateProfile(user, { displayName: trimmed });

    const availabilitiesQuery = query(
      collection(db, "availabilities"),
      where("userId", "==", user.uid)
    );
    const snap = await withRetry(() => getDocs(availabilitiesQuery));
    if (snap.empty) return;

    const BATCH_SIZE = 500;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) {
        batch.update(d.ref, { userName: trimmed });
      }
      await withRetry(() => batch.commit());
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        loading,
        isAdmin,
        isTrainer,
        isEmbeddedBrowser: isEmbeddedBrowserFlag,
        signInWithGoogle,
        signOut,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
