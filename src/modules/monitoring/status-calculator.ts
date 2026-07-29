import type { CheckStatus, HttpStatus } from "@prisma/client";
const rank: Record<CheckStatus,number>={UNKNOWN:0,HEALTHY:1,WARNING:2,URGENT:3,CRITICAL:4,EXPIRED:5,INVALID:6,UNAVAILABLE:7};
export function combinedStatus(certificates: CheckStatus[], http?: HttpStatus): CheckStatus {
  const statuses=[...certificates]; if (http && http !== "AVAILABLE") statuses.push("UNAVAILABLE");
  return statuses.sort((a,b)=>rank[b]-rank[a])[0] ?? "UNKNOWN";
}
