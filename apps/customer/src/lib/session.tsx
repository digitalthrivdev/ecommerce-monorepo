import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { apiFetch, setAccessToken, setUnauthorizedHandler } from "./api";
import { queryClient } from "./query-client";
import type { User } from "./types";

const TOKEN_KEY = "session.token";
const USER_KEY = "session.user";

type SessionValue = {
  token: string | null;
  user: User | null;
  /** True while the stored session is being read at startup. */
  isLoading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    setAccessToken(null);
    setToken(null);
    setUserState(null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "settings" });
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]).catch(() => {});
  }, []);

  const signIn = useCallback(async (nextToken: string, nextUser: User) => {
    await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, nextToken), SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser))]);
    setAccessToken(nextToken);
    setToken(nextToken);
    setUserState(nextUser);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedToken, storedUser] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]).catch(() => [null, null]);
      if (cancelled) return;
      if (storedToken) {
        setAccessToken(storedToken);
        setToken(storedToken);
        try {
          setUserState(storedUser ? (JSON.parse(storedUser) as User) : null);
        } catch {}
      }
      setIsLoading(false);

      // Refresh the profile; an expired or revoked token signs out through the 401 handler.
      if (storedToken) {
        apiFetch<User>("/users/me").then(
          (me) => (me.role === "CUSTOMER" ? setUser(me) : void signOut()),
          () => {},
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser, signOut]);

  const value = useMemo(() => ({ token, user, isLoading, signIn, signOut, setUser }), [token, user, isLoading, signIn, signOut, setUser]);
  return <SessionContext value={value}>{children}</SessionContext>;
}
