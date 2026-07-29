import dns from "node:dns/promises";
import net from "node:net";

const blockedV4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.18\./, /^198\.19\./, /^224\./, /^255\./
];
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return blockedV4.some(rule => rule.test(ip)) || ip === "169.254.169.254";
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
      value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
  }
  return true;
}
export async function assertPublicHost(hostname: string, allowPrivate = false): Promise<string[]> {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "metadata.google.internal") {
    throw new Error("Blocked host");
  }
  const addresses = net.isIP(normalized) ? [normalized] : (await dns.lookup(normalized, { all: true, verbatim: true })).map(x => x.address);
  if (!addresses.length || (!allowPrivate && addresses.some(isBlockedAddress))) throw new Error("Host resolves to a blocked address");
  return addresses;
}
export async function validatePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only credential-free HTTP(S) URLs are allowed");
  await assertPublicHost(url.hostname);
  return url;
}
