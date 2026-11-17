-- Integrity rules that the Prisma schema language cannot express.
--
-- They are a second line of defence: the application already enforces all of this, and these
-- constraints make sure a bug (or a hand-written query) can never leave the data in a state
-- that mixes up "what one person wrote down" with "what two people agreed on".
--
-- Error messages start with a stable code (SD0xx) so they are easy to find in logs.

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Debt"
  ADD CONSTRAINT "Debt_principal_positive" CHECK ("principalMinor" > 0),
  ADD CONSTRAINT "Debt_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  -- A personal record has exactly one owner and no bilateral machinery;
  -- a shared agreement has no owner (it belongs to its two participants).
  ADD CONSTRAINT "Debt_shape_by_mode" CHECK (
    (
      "mode" = 'PERSONAL'
      AND "ownerId" IS NOT NULL
      AND "ownerRole" IS NOT NULL
      AND "contactId" IS NOT NULL
      AND "currentVersionId" IS NULL
      AND "sourceDebtId" IS NULL
    )
    OR
    (
      "mode" = 'SHARED'
      AND "ownerId" IS NULL
      AND "ownerRole" IS NULL
      AND "contactId" IS NULL
      AND "privateNotes" IS NULL
      AND "receivingAccountId" IS NULL
    )
  ),
  ADD CONSTRAINT "Debt_status_by_mode" CHECK (
    ("mode" = 'PERSONAL' AND "status" IN ('ACTIVE', 'SETTLED', 'CANCELLED', 'CONVERTED'))
    OR
    ("mode" = 'SHARED' AND "status" IN ('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'ACTIVE', 'DISPUTED', 'SETTLED', 'CANCELLED'))
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Payment_reversal_shape" CHECK (("kind" = 'REVERSAL') = ("reversesId" IS NOT NULL)),
  ADD CONSTRAINT "Payment_historical_shape" CHECK (
    "origin" <> 'HISTORICAL' OR ("kind" = 'PAYMENT' AND "status" = 'CONFIRMED' AND "versionId" IS NOT NULL)
  ),
  ADD CONSTRAINT "Payment_confirmed_at" CHECK (("status" = 'CONFIRMED') = ("confirmedAt" IS NOT NULL));

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Installment_sequence_positive" CHECK ("sequence" >= 1);

ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "BankAccount_clabe_last4" CHECK ("clabeLast4" IS NULL OR "clabeLast4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "BankAccount_account_last4" CHECK ("accountLast4" IS NULL OR "accountLast4" ~ '^[0-9A-Za-z]{1,4}$');

ALTER TABLE "UserPreferences"
  ADD CONSTRAINT "UserPreferences_locale" CHECK ("locale" IN ('es', 'en')),
  ADD CONSTRAINT "UserPreferences_currency_format" CHECK ("defaultCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "DebtVersion"
  ADD CONSTRAINT "DebtVersion_number_positive" CHECK ("number" >= 1);

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_size_positive" CHECK ("sizeBytes" > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- A debt never changes mode
-- ─────────────────────────────────────────────────────────────────────────────
-- Converting a personal record creates a NEW shared agreement. The original row keeps its mode
-- (and its private history) forever.

CREATE FUNCTION sd_debt_mode_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW."mode" IS DISTINCT FROM OLD."mode" THEN
    RAISE EXCEPTION 'SD001: the mode of a debt cannot change (% -> %)', OLD."mode", NEW."mode"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Debt_mode_frozen"
  BEFORE UPDATE OF "mode" ON "Debt"
  FOR EACH ROW EXECUTE FUNCTION sd_debt_mode_frozen();

-- ─────────────────────────────────────────────────────────────────────────────
-- A movement's status must match the mode of its debt
-- ─────────────────────────────────────────────────────────────────────────────
-- Personal records only ever hold PERSONAL_RECORD rows, so nothing in them can be mistaken
-- for a bilateral confirmation. Shared agreements never hold PERSONAL_RECORD rows.

CREATE FUNCTION sd_payment_matches_mode() RETURNS trigger AS $$
DECLARE
  debt_mode "DebtMode";
BEGIN
  SELECT "mode" INTO debt_mode FROM "Debt" WHERE "id" = NEW."debtId";

  IF debt_mode = 'PERSONAL' AND NEW."status" <> 'PERSONAL_RECORD' THEN
    RAISE EXCEPTION 'SD002: a personal record cannot hold a bilateral movement (status %)', NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;

  IF debt_mode = 'SHARED' AND NEW."status" = 'PERSONAL_RECORD' THEN
    RAISE EXCEPTION 'SD003: a shared agreement cannot hold a personal record'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_matches_mode"
  BEFORE INSERT OR UPDATE OF "status", "debtId" ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION sd_payment_matches_mode();

-- ─────────────────────────────────────────────────────────────────────────────
-- Confirmed movements are immutable
-- ─────────────────────────────────────────────────────────────────────────────
-- Once both sides confirmed a movement it can no longer be edited or deleted. Corrections are
-- new rows: a REVERSAL or an ADJUSTMENT that both sides approve.
--
-- pg_trigger_depth() > 1 means the change comes from a referential action of a parent row
-- (the whole agreement being removed, or a user account being deleted and its id set to NULL),
-- not from a statement aimed at this row.

CREATE FUNCTION sd_payment_immutable_when_confirmed() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() = 1 AND OLD."status" = 'CONFIRMED' THEN
    RAISE EXCEPTION 'SD004: confirmed movements cannot be changed or deleted; record a reversal or an adjustment instead'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_immutable_when_confirmed"
  BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION sd_payment_immutable_when_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- Versions are fixed snapshots
-- ─────────────────────────────────────────────────────────────────────────────
-- Only a DRAFT can be rewritten. Once proposed, the terms are frozen: both sides must be
-- looking at exactly the same thing. An accepted version can only be superseded by a later one.

CREATE FUNCTION sd_version_frozen() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'SD005: a version that was proposed cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
       NEW."terms" IS DISTINCT FROM OLD."terms"
    OR NEW."termsHash" IS DISTINCT FROM OLD."termsHash"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."debtId" IS DISTINCT FROM OLD."debtId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."proposedByRole" IS DISTINCT FROM OLD."proposedByRole"
  ) THEN
    RAISE EXCEPTION 'SD006: the terms of a proposed version cannot be changed; propose a new version instead'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" = 'ACCEPTED' AND NEW."status" NOT IN ('ACCEPTED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'SD007: an accepted version can only be superseded (% -> %)', OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."status" IN ('REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'WITHDRAWN')
     AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'SD008: a closed version cannot be reopened (% -> %)', OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DebtVersion_frozen"
  BEFORE UPDATE OR DELETE ON "DebtVersion"
  FOR EACH ROW EXECUTE FUNCTION sd_version_frozen();

-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only history
-- ─────────────────────────────────────────────────────────────────────────────
-- Audit events and approval records are written once. They only disappear together with the
-- debt or the account they belong to.

CREATE FUNCTION sd_append_only() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'SD009: % is append-only (% not allowed)', TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION sd_append_only();

CREATE TRIGGER "DebtApproval_append_only"
  BEFORE UPDATE OR DELETE ON "DebtApproval"
  FOR EACH ROW EXECUTE FUNCTION sd_append_only();

CREATE TRIGGER "PaymentApproval_append_only"
  BEFORE UPDATE OR DELETE ON "PaymentApproval"
  FOR EACH ROW EXECUTE FUNCTION sd_append_only();
