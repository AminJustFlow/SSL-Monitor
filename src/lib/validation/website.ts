import { z } from "zod";

const bool = z.union([z.boolean(), z.literal("on")]).transform(v => v === true || v === "on").default(false);
const csv = z.union([z.string(), z.array(z.string())]).transform(v => (Array.isArray(v) ? v : v.split(",")).map(x => x.trim()).filter(Boolean));
export const websiteSchema = z.object({
  clientName: z.string().trim().min(1).max(120),
  websiteName: z.string().trim().min(1).max(120),
  publicUrl: z.string().trim().url(),
  hostname: z.string().trim().min(1).max(253),
  port: z.coerce.number().int().positive().default(443),
  enabled: bool,
  checkPublicCertificate: bool,
  checkHttp: bool,
  usesCloudflare: bool,
  checkOriginCertificate: bool,
  originConnectHost: z.string().trim().max(253).optional().or(z.literal("")),
  originSniHostname: z.string().trim().max(253).optional().or(z.literal("")),
  tlsTimeoutMs: z.coerce.number().int().min(1000).max(60000).default(10000),
  httpTimeoutMs: z.coerce.number().int().min(1000).max(60000).default(15000),
  alertRecipients: csv.pipe(z.array(z.string().email())).default([]),
  alertThresholds: csv.transform(v => v.map(Number)).pipe(z.array(z.number().int().min(0).max(365))).default("30,14,7,3,1,0"),
  hostingProvider: z.string().trim().max(120).optional(),
  renewalMethod: z.string().trim().max(120).optional(),
  responsibleParty: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(5000).optional()
});
