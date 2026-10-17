-- Preserve every definitively rejected transmission before reusing the unique draft claim.
-- Unknown, pending and authorized transmissions can never be retried using this function.
CREATE TABLE IF NOT EXISTS public.fiscal_cte_retry_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 draft_id uuid NOT NULL,
 transmission_id uuid NOT NULL,
 previous_idempotency_key uuid NOT NULL UNIQUE,
 previous_hash text NOT NULL,
 previous_status text NOT NULL,
 previous_error_code text,
 previous_response jsonb,
 requested_by uuid NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_cte_retry_history_draft_idx
 ON public.fiscal_cte_retry_history(workspace_id,draft_id,archived_at DESC);
ALTER TABLE public.fiscal_cte_retry_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_cte_retry_history FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.claim_corrected_cte_retry(
 p_workspace uuid,p_draft uuid,p_user uuid,p_hash text,p_new_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $$
DECLARE existing public.fiscal_cte_transmissions%ROWTYPE;
BEGIN
 IF p_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO existing FROM public.fiscal_cte_transmissions
 WHERE workspace_id=p_workspace AND draft_id=p_draft FOR UPDATE;
 IF NOT FOUND OR existing.status <> 'rejected'
    OR existing.access_key IS NOT NULL OR existing.protocol IS NOT NULL
    OR COALESCE(existing.provider_response->>'definitive_rejection','false') <> 'true'
 THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.fiscal_drafts
  WHERE id=p_draft AND workspace_id=p_workspace
  AND (status <> 'draft' OR checklist->>'do_not_issue_duplicate'='true'
       OR checklist ? 'previous_external_cte_key')) THEN RETURN NULL; END IF;
 INSERT INTO public.fiscal_cte_retry_history
  (workspace_id,draft_id,transmission_id,previous_idempotency_key,
   previous_hash,previous_status,previous_error_code,previous_response,requested_by)
 VALUES (existing.workspace_id,existing.draft_id,existing.id,existing.idempotency_key,
         existing.payload_sha256,existing.status,existing.error_code,
         existing.provider_response,existing.requested_by);
 UPDATE public.fiscal_cte_transmissions SET
   status='sending',requested_by=p_user,idempotency_key=p_new_key,
   payload_sha256=p_hash,access_key=NULL,protocol=NULL,error_code=NULL,
   provider_response=NULL,updated_at=now()
 WHERE id=existing.id;
 RETURN existing.id;
END $$;
REVOKE ALL ON FUNCTION public.claim_corrected_cte_retry(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_corrected_cte_retry(uuid,uuid,uuid,text,uuid) TO service_role;
