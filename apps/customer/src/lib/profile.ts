import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "./api";
import { useSession } from "./session";
import type { User } from "./types";

export type ProfileInput = { name: string; email: string | null };

export function useUpdateProfile() {
  const { setUser } = useSession();
  return useMutation({
    mutationFn: (input: ProfileInput) => apiFetch<User>("/users/me", { method: "PATCH", body: input }),
    onSuccess: setUser,
  });
}
