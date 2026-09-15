import {describe,expect,it} from "vitest";
import {decideDailyRun,isDailyScheduleDue,localDateKey,retryDelayMs} from "@/modules/scheduling/daily-schedule";
import {alertRetryDelayMs} from "@/modules/alerts/alert-outbox";

describe("daily scheduler timing",()=>{
  it("uses the New York local calendar date",()=>expect(localDateKey(new Date("2026-09-16T02:00:00Z"),"America/New_York")).toBe("2026-09-15"));
  it("waits until 7 AM local time",()=>{expect(isDailyScheduleDue(new Date("2026-09-15T10:59:00Z"),"America/New_York","07:00")).toBe(false);expect(isDailyScheduleDue(new Date("2026-09-15T11:00:00Z"),"America/New_York","07:00")).toBe(true)});
  it("handles winter daylight-saving offset",()=>expect(isDailyScheduleDue(new Date("2026-12-15T12:00:00Z"),"America/New_York","07:00")).toBe(true));
  it("defines 15 and 60 minute run retries",()=>{expect(retryDelayMs(1)).toBe(15*60_000);expect(retryDelayMs(2)).toBe(60*60_000);expect(retryDelayMs(3)).toBeUndefined()});
  it("defines all persisted email retry delays",()=>expect([0,1,2,3,4].map(alertRetryDelayMs)).toEqual([5*60_000,30*60_000,2*60*60_000,6*60*60_000,undefined]));
  it("runs a catch-up when no run exists",()=>expect(decideDailyRun([],new Date("2026-09-15T15:00:00Z"))).toEqual({status:"RUN",attempt:1}));
  it("does not run twice after completion",()=>expect(decideDailyRun([{status:"COMPLETED",attempt:1,startedAt:new Date("2026-09-15T11:00:00Z"),completedAt:new Date("2026-09-15T11:05:00Z")}],new Date("2026-09-15T15:00:00Z"))).toEqual({status:"COMPLETED"}));
  it("waits and then retries partial runs",()=>{const run={status:"PARTIAL",attempt:1,startedAt:new Date("2026-09-15T11:00:00Z"),completedAt:new Date("2026-09-15T11:05:00Z")};expect(decideDailyRun([run],new Date("2026-09-15T11:10:00Z"))).toEqual({status:"RETRY_WAIT"});expect(decideDailyRun([run],new Date("2026-09-15T11:20:00Z"))).toEqual({status:"RUN",attempt:2})});
  it("stops after the third failed attempt",()=>expect(decideDailyRun([{status:"FAILED",attempt:3,startedAt:new Date("2026-09-15T13:00:00Z"),completedAt:new Date("2026-09-15T13:01:00Z")}],new Date("2026-09-15T15:00:00Z"))).toEqual({status:"EXHAUSTED"}));
});
