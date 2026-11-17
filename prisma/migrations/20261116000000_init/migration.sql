-- CreateEnum
CREATE TYPE "DebtMode" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'ACTIVE', 'DISPUTED', 'SETTLED', 'CANCELLED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('DEBTOR', 'CREDITOR');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('NONE', 'SINGLE', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PERSONAL_RECORD', 'PENDING', 'CLARIFICATION', 'CONFIRMED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentOrigin" AS ENUM ('RECORDED', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "PaymentDecision" AS ENUM ('APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED', 'CLARIFIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('INITIAL', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PROPOSED', 'ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'USED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditScope" AS ENUM ('PERSONAL', 'SHARED', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ACTION_REQUIRED', 'ACTIVITY', 'REMINDER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "userId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailActionRequired" BOOLEAN NOT NULL DEFAULT true,
    "emailActivity" BOOLEAN NOT NULL DEFAULT false,
    "emailReminders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "linkedUserId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "mode" "DebtMode" NOT NULL,
    "status" "DebtStatus" NOT NULL,
    "ownerId" TEXT,
    "createdById" TEXT,
    "ownerRole" "PartyRole",
    "contactId" TEXT,
    "privateNotes" TEXT,
    "receivingAccountId" TEXT,
    "concept" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "principalMinor" BIGINT NOT NULL,
    "originDate" DATE NOT NULL,
    "dueDate" DATE,
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'NONE',
    "plannedMethod" "PaymentMethodType",
    "sharedNotes" TEXT,
    "balanceAsOf" DATE,
    "currentVersionId" TEXT,
    "sourceDebtId" TEXT,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "disputeOpenedByRole" "PartyRole",
    "disputeOpenedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "cancelRequestedByRole" "PartyRole",
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelRequestReason" TEXT,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtParticipant" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "identityConfirmedAt" TIMESTAMP(3),
    "counterpartyContactId" TEXT,
    "privateNote" TEXT,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtVersion" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "VersionKind" NOT NULL,
    "status" "VersionStatus" NOT NULL,
    "proposedByRole" "PartyRole" NOT NULL,
    "proposedById" TEXT,
    "terms" JSONB NOT NULL,
    "termsHash" TEXT NOT NULL,
    "changeNote" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DebtVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtApproval" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "userId" TEXT,
    "decision" "ApprovalDecision" NOT NULL,
    "termsHash" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "origin" "PaymentOrigin" NOT NULL DEFAULT 'RECORDED',
    "amountMinor" BIGINT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "recordedByRole" "PartyRole",
    "method" "PaymentMethodType",
    "reference" TEXT,
    "notes" TEXT,
    "place" TEXT,
    "reversesId" TEXT,
    "versionId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentApproval" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "userId" TEXT,
    "decision" "PaymentDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBankDetails" (
    "paymentId" TEXT NOT NULL,
    "originBank" TEXT,
    "destinationAccountId" TEXT,
    "destinationLabel" TEXT,
    "trackingKey" TEXT,

    CONSTRAINT "PaymentBankDetails_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "clabeEnc" TEXT,
    "clabeLast4" TEXT,
    "accountNumberEnc" TEXT,
    "accountLast4" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccountShare" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccountShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "paymentId" TEXT,
    "uploaderId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "email" TEXT,
    "invitedById" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "debtId" TEXT,
    "data" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "emailPending" BOOLEAN NOT NULL DEFAULT false,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "scope" "AuditScope" NOT NULL,
    "type" TEXT NOT NULL,
    "debtId" TEXT,
    "userId" TEXT,
    "actorId" TEXT,
    "actorRole" "PartyRole",
    "paymentId" TEXT,
    "versionId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expires_idx" ON "Session"("expires");

-- CreateIndex
CREATE INDEX "Contact_ownerId_archivedAt_idx" ON "Contact"("ownerId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_ownerId_linkedUserId_key" ON "Contact"("ownerId", "linkedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_currentVersionId_key" ON "Debt"("currentVersionId");

-- CreateIndex
CREATE INDEX "Debt_ownerId_status_idx" ON "Debt"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Debt_contactId_idx" ON "Debt"("contactId");

-- CreateIndex
CREATE INDEX "Debt_sourceDebtId_idx" ON "Debt"("sourceDebtId");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_createdById_idempotencyKey_key" ON "Debt"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_one_live_conversion" ON "Debt"("sourceDebtId") WHERE ("sourceDebtId" IS NOT NULL AND "status" <> 'CANCELLED');

-- CreateIndex
CREATE INDEX "DebtParticipant_userId_idx" ON "DebtParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtParticipant_debtId_role_key" ON "DebtParticipant"("debtId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "DebtParticipant_debtId_userId_key" ON "DebtParticipant"("debtId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtVersion_debtId_number_key" ON "DebtVersion"("debtId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DebtVersion_debtId_idempotencyKey_key" ON "DebtVersion"("debtId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DebtVersion_one_open_proposal" ON "DebtVersion"("debtId") WHERE ("status" = 'PROPOSED');

-- CreateIndex
CREATE UNIQUE INDEX "DebtApproval_versionId_role_key" ON "DebtApproval"("versionId", "role");

-- CreateIndex
CREATE INDEX "Installment_dueDate_idx" ON "Installment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_debtId_sequence_key" ON "Installment"("debtId", "sequence");

-- CreateIndex
CREATE INDEX "Payment_debtId_status_idx" ON "Payment"("debtId", "status");

-- CreateIndex
CREATE INDEX "Payment_debtId_effectiveDate_idx" ON "Payment"("debtId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_debtId_idempotencyKey_key" ON "Payment"("debtId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_one_live_reversal" ON "Payment"("reversesId") WHERE ("reversesId" IS NOT NULL AND "status" <> 'REJECTED' AND "status" <> 'WITHDRAWN');

-- CreateIndex
CREATE INDEX "PaymentApproval_paymentId_createdAt_idx" ON "PaymentApproval"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_one_preferred" ON "BankAccount"("userId") WHERE ("isPreferred");

-- CreateIndex
CREATE INDEX "BankAccountShare_debtId_idx" ON "BankAccountShare"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccountShare_bankAccountId_debtId_key" ON "BankAccountShare"("bankAccountId", "debtId");

-- CreateIndex
CREATE INDEX "Attachment_debtId_idx" ON "Attachment"("debtId");

-- CreateIndex
CREATE INDEX "Attachment_paymentId_idx" ON "Attachment"("paymentId");

-- CreateIndex
CREATE INDEX "Attachment_storageKey_idx" ON "Attachment"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_one_pending" ON "Invitation"("debtId") WHERE ("status" = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailPending_createdAt_idx" ON "Notification"("emailPending", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_debtId_createdAt_idx" ON "AuditEvent"("debtId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DebtVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_sourceDebtId_fkey" FOREIGN KEY ("sourceDebtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtParticipant" ADD CONSTRAINT "DebtParticipant_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtParticipant" ADD CONSTRAINT "DebtParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtParticipant" ADD CONSTRAINT "DebtParticipant_counterpartyContactId_fkey" FOREIGN KEY ("counterpartyContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtVersion" ADD CONSTRAINT "DebtVersion_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtApproval" ADD CONSTRAINT "DebtApproval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DebtVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Payment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DebtVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBankDetails" ADD CONSTRAINT "PaymentBankDetails_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBankDetails" ADD CONSTRAINT "PaymentBankDetails_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountShare" ADD CONSTRAINT "BankAccountShare_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccountShare" ADD CONSTRAINT "BankAccountShare_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
