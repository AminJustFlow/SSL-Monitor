import crypto from "node:crypto";
import { cookies } from "next/headers";
const NAME = "ssl_monitor_csrf";
export async function csrfToken() {
  const jar = await cookies(); let value = jar.get(NAME)?.value;
  if (!value) { value = crypto.randomBytes(24).toString("hex"); jar.set(NAME, value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" }); }
  return value;
}
export async function verifyCsrf(value: FormDataEntryValue | null) {
  const expected = (await cookies()).get(NAME)?.value;
  if (!expected || typeof value !== "string" || value.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) throw new Error("Invalid CSRF token");
}
