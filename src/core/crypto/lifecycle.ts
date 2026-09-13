export const resumeLimitMs = 60000;
export function requiresUnlock(backgroundAt: number | null, now: number, hasSession: boolean): boolean {
  return !hasSession || backgroundAt === null || now < backgroundAt || now - backgroundAt >= resumeLimitMs;
}
