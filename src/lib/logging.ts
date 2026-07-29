export function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  const safe = Object.fromEntries(Object.entries(data).filter(([key]) => !/password|secret|token/i.test(key)));
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe }));
}
