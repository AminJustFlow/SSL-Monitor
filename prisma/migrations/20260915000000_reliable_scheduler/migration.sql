ALTER TABLE "AlertEvent"
  ALTER COLUMN "websiteId" DROP NOT NULL,
  ADD COLUMN "textBody" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "htmlBody" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "MonitoringRun"
  ADD COLUMN "scheduleDate" TEXT,
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SchedulerState" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "lastScheduledDate" TEXT,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertEvent_deliveryStatus_nextAttemptAt_idx" ON "AlertEvent"("deliveryStatus", "nextAttemptAt");
CREATE INDEX "MonitoringRun_scheduleDate_attempt_idx" ON "MonitoringRun"("scheduleDate", "attempt");
UPDATE "MonitoringRun" SET "status" = 'FAILED', "completedAt" = CURRENT_TIMESTAMP, "errorMessage" = COALESCE("errorMessage", 'Closed during reliable scheduler migration') WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "MonitoringRun_single_running_idx" ON "MonitoringRun" ((true)) WHERE "status" = 'RUNNING';
