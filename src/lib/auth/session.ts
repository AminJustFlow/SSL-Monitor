import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { db } from "@/lib/database";

const COOKIE = "ssl_monitor_session";
const key = () => new TextEncoder().encode(config().SESSION_SECRET);
export async function createSession(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: config().NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 43200 });
}
export async function deleteSession() { (await cookies()).delete(COOKIE); }
export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return await db.user.findFirst({ where: { id: String(payload.userId), enabled: true }, select: { id: true, email: true, name: true, role: true } });
  } catch { return null; }
}
export async function requireUser() { const user = await currentUser(); if (!user) redirect("/login"); return user; }
