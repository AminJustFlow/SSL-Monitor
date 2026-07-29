const attempts = new Map<string, { count: number; reset: number }>();
export function loginAllowed(key: string) { const now=Date.now(); const item=attempts.get(key); if (!item || item.reset < now) return true; return item.count < 5; }
export function recordLoginFailure(key: string) { const now=Date.now(); const item=attempts.get(key); attempts.set(key, !item || item.reset < now ? {count:1,reset:now+15*60_000}:{...item,count:item.count+1}); }
export function clearLoginFailures(key: string) { attempts.delete(key); }
