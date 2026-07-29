import { validatePublicUrl } from "@/lib/security/network";

export interface HttpResult { success: boolean; statusCode?: number; finalUrl?: string; responseTimeMs: number; redirectCount: number; status: "AVAILABLE"|"UNAVAILABLE"|"CLOUDFLARE_ERROR"|"UNKNOWN"; errorCode?: string; errorMessage?: string }
export async function checkHttp(rawUrl: string, timeoutMs = 15000, maxRedirects = 5): Promise<HttpResult> {
  const started = Date.now(); let current = rawUrl; let redirects = 0;
  try {
    while (true) {
      const url = await validatePublicUrl(current);
      const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "JustFlow-SSL-Monitor/1.0", accept: "*/*" } });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (redirects++ >= maxRedirects) throw new Error("Too many redirects");
        current = new URL(response.headers.get("location")!, url).toString();
        continue;
      }
      const cloudflare = response.status === 525 || response.status === 526;
      return { success: response.status >= 200 && response.status <= 399, statusCode: response.status, finalUrl: url.toString(), responseTimeMs: Date.now()-started, redirectCount: redirects, status: cloudflare ? "CLOUDFLARE_ERROR" : response.status <= 399 ? "AVAILABLE" : "UNAVAILABLE" };
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return { success: false, responseTimeMs: Date.now()-started, redirectCount: redirects, status: "UNAVAILABLE", errorCode: err.code ?? (err.name === "TimeoutError" ? "TIMEOUT" : "HTTP_ERROR"), errorMessage: err.message };
  }
}
