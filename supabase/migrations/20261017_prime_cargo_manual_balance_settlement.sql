-- Baixa manual do saldo: vinculada à carga e ao usuário, sem movimentação bancária.
ALTER TABLE public.prime_cargo_operations
 ADD COLUMN IF NOT EXISTS manual_settled_on date,
 ADD COLUMN IF NOT EXISTS manual_settled_at timestamptz,
 ADD COLUMN IF NOT EXISTS manual_settlement_note text NOT NULL DEFAULT ''
  CHECK (char_length(manual_settlement_note) <= 300),
 ADD COLUMN IF NOT EXISTS manual_settled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.prime_cargo_operations.manual_settled_on IS
 'Data informada de recebimento do saldo da Ortobom; NULL significa sem baixa manual.';
COMMENT ON COLUMN public.prime_cargo_operations.manual_settled_at IS
 'Timestamp do registro manual, sem lançamento ou verificação no extrato bancário.';

-- O valor baixado é preservado para suportar recebimento parcial.
ALTER TABLE public.prime_cargo_operations
 ADD COLUMN IF NOT EXISTS manual_settled_amount numeric(12,2)
 CHECK (manual_settled_amount > 0 AND manual_settled_amount <= 1000000);
ALTER TABLE public.prime_cargo_operations
 ADD CONSTRAINT prime_cargo_manual_settlement_pair_check
 CHECK ((manual_settled_on IS NULL AND manual_settled_amount IS NULL)
     OR (manual_settled_on IS NOT NULL AND manual_settled_amount IS NOT NULL));
COMMENT ON COLUMN public.prime_cargo_operations.manual_settled_amount IS
 'Valor declarado recebido manualmente, independente do e-mail e extrato bancário.';
