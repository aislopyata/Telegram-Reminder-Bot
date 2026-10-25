-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('ONCE', 'RECURRING');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'DISABLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'RETRYABLE', 'PERMANENT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('WIZARD', 'AWAIT_TEXT', 'AWAIT_FRIEND_USERNAME', 'AWAIT_TIMEZONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT NOT NULL,
    "timeZone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "recurrenceType" "RecurrenceType",
    "scheduledAtUtc" TIMESTAMP(3),
    "localTime" TEXT,
    "timeZone" TEXT NOT NULL,
    "recurrenceDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "nextRunAtUtc" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimToken" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRecipient" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderOccurrence" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "scheduledAtUtc" TIMESTAMP(3) NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ReminderOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAtUtc" TIMESTAMP(3),
    "lastError" TEXT,
    "claimToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "WorkflowState" NOT NULL,
    "data" JSONB NOT NULL,
    "messageId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedUpdate" (
    "updateId" BIGINT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_telegramUsername_idx" ON "User"("telegramUsername");

-- CreateIndex
CREATE INDEX "Reminder_ownerId_createdAt_idx" ON "Reminder"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_status_nextRunAtUtc_idx" ON "Reminder"("status", "nextRunAtUtc");

-- CreateIndex
CREATE INDEX "Reminder_claimExpiresAt_idx" ON "Reminder"("claimExpiresAt");

-- CreateIndex
CREATE INDEX "ReminderRecipient_recipientUserId_idx" ON "ReminderRecipient"("recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRecipient_reminderId_recipientUserId_key" ON "ReminderRecipient"("reminderId", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_pairKey_key" ON "FriendRequest"("pairKey");

-- CreateIndex
CREATE INDEX "FriendRequest_recipientId_status_idx" ON "FriendRequest"("recipientId", "status");

-- CreateIndex
CREATE INDEX "FriendRequest_requesterId_status_idx" ON "FriendRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Friendship_userBId_idx" ON "Friendship"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_status_idx" ON "ReminderOccurrence"("status");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_createdAt_idx" ON "ReminderOccurrence"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_reminderId_scheduledAtUtc_key" ON "ReminderOccurrence"("reminderId", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "ReminderDelivery_status_nextAttemptAtUtc_idx" ON "ReminderDelivery"("status", "nextAttemptAtUtc");

-- CreateIndex
CREATE INDEX "ReminderDelivery_lockedUntil_idx" ON "ReminderDelivery"("lockedUntil");

-- CreateIndex
CREATE INDEX "ReminderDelivery_recipientUserId_idx" ON "ReminderDelivery"("recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDelivery_occurrenceId_recipientUserId_key" ON "ReminderDelivery"("occurrenceId", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_userId_key" ON "Workflow"("userId");

-- CreateIndex
CREATE INDEX "Workflow_expiresAt_idx" ON "Workflow"("expiresAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRecipient" ADD CONSTRAINT "ReminderRecipient_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRecipient" ADD CONSTRAINT "ReminderRecipient_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ReminderOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application invariants enforced at the database level as a second line of defense.
ALTER TABLE "User"
  ADD CONSTRAINT "User_telegramUserId_numeric_check" CHECK ("telegramUserId" ~ '^[0-9]{1,20}$');

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_text_length_check" CHECK (char_length("text") BETWEEN 1 AND 1000),
  ADD CONSTRAINT "Reminder_recurrence_shape_check" CHECK (
    (
      "type" = 'ONCE'
      AND "recurrenceType" IS NULL
      AND "scheduledAtUtc" IS NOT NULL
      AND "localTime" IS NULL
      AND cardinality("recurrenceDays") = 0
    )
    OR
    (
      "type" = 'RECURRING'
      AND "recurrenceType" IS NOT NULL
      AND "scheduledAtUtc" IS NULL
      AND "localTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND cardinality("recurrenceDays") > 0
    )
  ),
  ADD CONSTRAINT "Reminder_weekly_days_check" CHECK (
    "recurrenceType" <> 'WEEKLY'
    OR "recurrenceDays" <@ ARRAY[1,2,3,4,5,6,7]
  ),
  ADD CONSTRAINT "Reminder_monthly_days_check" CHECK (
    "recurrenceType" <> 'MONTHLY'
    OR "recurrenceDays" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]
  );

ALTER TABLE "FriendRequest"
  ADD CONSTRAINT "FriendRequest_not_self_check" CHECK ("requesterId" <> "recipientId");

ALTER TABLE "Friendship"
  ADD CONSTRAINT "Friendship_ordered_pair_check" CHECK ("userAId" < "userBId");

ALTER TABLE "ReminderDelivery"
  ADD CONSTRAINT "ReminderDelivery_attempts_check" CHECK ("attempts" >= 0);
