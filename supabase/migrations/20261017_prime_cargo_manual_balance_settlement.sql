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
