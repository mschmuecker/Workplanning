import {
  getUser,
  handleAuthCallback,
  login,
  logout,
  signup,
  type User as NetlifyUser,
} from "@netlify/identity";
import { useEffect, useState } from "react";

// In local `vite` dev there is no Netlify Identity endpoint, so signing in is
// impossible. Bypass the auth gate with a stand-in user; production builds
// (vite build) still go through the real Identity flow.
const DEV_AUTH_BYPASS = import.meta.env.DEV;

const DEV_USER = {
  id: "local-dev-user",
  email: "local@dev.test",
  user_metadata: { full_name: "Local Dev" },
} as unknown as NetlifyUser;

export function useAuth() {
  const [user, setUser] = useState<NetlifyUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      setUser(DEV_USER);
      setAuthReady(true);
      return;
    }

    let ignore = false;

    async function loadUser() {
      try {
        await handleAuthCallback();
        const currentUser = await getUser();
        if (!ignore) setUser(currentUser);
      } catch (error) {
        if (!ignore) setAuthError(error instanceof Error ? error.message : "Unable to load account.");
      } finally {
        if (!ignore) setAuthReady(true);
      }
    }

    loadUser();

    return () => {
      ignore = true;
    };
  }, []);

  async function signIn(email: string, password: string) {
    setAuthError("");
    try {
      const nextUser = await login(email, password);
      setUser(nextUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  async function register(email: string, password: string, fullName: string) {
    setAuthError("");
    try {
      const nextUser = await signup(email, password, {
        full_name: fullName,
      });
      setUser(nextUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create account.");
    }
  }

  async function signOut() {
    setAuthError("");
    if (DEV_AUTH_BYPASS) {
      setUser(DEV_USER);
      return;
    }
    await logout();
    setUser(null);
  }

  return { user, authReady, authError, signIn, register, signOut };
}
