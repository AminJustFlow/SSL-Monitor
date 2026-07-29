import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

const SESSION_COOKIE = "ssl_monitor_session";

export async function csrfToken() {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) throw new Error("Authentication required");
  return crypto.createHmac("sha256", config().SESSION_SECRET).update(session).digest("hex");
}
export async function verifyCsrf(value: FormDataEntryValue | null) {
  const expected = await csrfToken();
  if (!expected || typeof value !== "string" || value.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) throw new Error("Invalid CSRF token");
}
