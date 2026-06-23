/**
 * Pure decision logic for the API client's global 401 handling, split out so it
 * can be unit-tested without pulling in React Native / Expo modules.
 *
 * When an authenticated request comes back 401, the persisted session token is
 * stale/invalid — the app must clear it (log out) so the user falls back to the
 * guest/login flow instead of being stranded in a view where every call fails.
 */

// Endpoints where a 401 is an expected, in-band result (bad credentials) rather
// than an expired session — never clear the session for these.
export const AUTH_EXEMPT_ENDPOINTS = ['/login/access-token'];

export function shouldClearSessionOn401(
  status: number | undefined,
  endpoint: string,
  hasToken: boolean,
): boolean {
  if (status !== 401) return false;
  // No session to clear (also debounces a burst of parallel 401s: the first
  // logout nulls the token, the rest become no-ops).
  if (!hasToken) return false;
  if (AUTH_EXEMPT_ENDPOINTS.some((e) => endpoint.startsWith(e))) return false;
  return true;
}
