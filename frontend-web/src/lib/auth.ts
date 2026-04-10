import { apiRequest } from "@/lib/api";
import type { AuthSession, AuthUser, BoutiqueSignupInfo, UserRole } from "@/types/auth";

const STORAGE_KEY = "dress-live-web-auth";

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function getAuthHeaders() {
  const session = getStoredSession();
  return session?.token
    ? ({ Authorization: `Bearer ${session.token}` } as Record<string, string>)
    : ({} as Record<string, string>);
}

export async function loginWithCredentials(email: string, password: string) {
  const form = new URLSearchParams();
  form.append("username", email.trim());
  form.append("password", password.trim());

  const tokenResponse = await apiRequest<{ access_token: string; token_type: string }>(
    "/login/access-token",
    {
      method: "POST",
      body: form,
    }
  );

  const user = await apiRequest<AuthUser>("/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenResponse.access_token}`,
    },
  });

  const session = {
    token: tokenResponse.access_token,
    user,
  };

  saveSession(session);
  return session;
}

export async function registerUser(input: {
  role: UserRole;
  fullName: string;
  email: string;
  password: string;
  boutiqueInfo?: BoutiqueSignupInfo;
}) {
  await apiRequest<AuthUser>("/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password.trim(),
      full_name: input.fullName.trim(),
      role: input.role,
      boutique_info: input.boutiqueInfo,
    }),
  });

  return loginWithCredentials(input.email, input.password);
}
