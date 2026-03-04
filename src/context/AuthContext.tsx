import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
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
}

const AuthContext = createContext<AuthContextType | null>(null);

async function resolveInvitedRole(email: string): Promise<UserRole | null> {
  try {
    const inviteRef = doc(db, "invites", email.toLowerCase());
    const snap = await getDoc(inviteRef);
    if (!snap.exists()) return null;
    const role = snap.data().role as UserRole;
    // Delete consumed invite; use try-catch so a delete failure
    // doesn't block user creation
    try {
      await deleteDoc(inviteRef);
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
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    await updateDoc(userRef, { lastLoginAt: Timestamp.now() });
  } else {
    let role: UserRole = "user";

    if (firebaseUser.email === ADMIN_EMAIL) {
      role = "admin";
    } else if (firebaseUser.email) {
      const invitedRole = await resolveInvitedRole(firebaseUser.email);
      if (invitedRole) role = invitedRole;
    }

    await setDoc(userRef, {
      email: firebaseUser.email ?? "",
      displayName: firebaseUser.displayName ?? "",
      photoURL: firebaseUser.photoURL ?? "",
      role,
      createdAt: Timestamp.now(),
      lastLoginAt: Timestamp.now(),
    });
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

function isMobileRealBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|webos|blackberry|iemobile|opera mini/i.test(ua);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    getRedirectResult(auth)
      .then((result) => {
        if (mounted && result?.user) {
          return upsertUserDoc(result.user);
        }
      })
      .catch(() => {
        // Redirect errors (e.g. user cancelled) are handled silently
      })
      .finally(() => {
        if (!mounted) return;
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);
          if (!firebaseUser) {
            setAppUser(null);
          } else {
            await upsertUserDoc(firebaseUser);
          }
          setLoading(false);
        });
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
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
    if (isEmbeddedBrowserFlag) {
      return;
    }
    if (isMobileRealBrowser()) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
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
