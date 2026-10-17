-- Multiple bank movements can share the same banking date. The legacy outbox
-- (user_id, reference) uniqueness was intended for one-per-reference reminders,
-- but bank cards use YYYYMMDD as reference and need one row per transaction.
-- Retain the original uniqueness for nonbank categories (report/reminders/collections).
drop index if exists public.outbox_reference_unique_idx;
create unique index outbox_reference_unique_idx on public.prime_outbox
 (user_id, reference) where reference is not null and category <> 'bank';

-- Bank report deduplication remains enforced by the existing UNIQUE(dedupe_key),
-- which contains request ID / movement ID, not the shared calendar day.
