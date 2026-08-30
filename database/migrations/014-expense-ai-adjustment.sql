-- Propuesta de la IA cuando un cargo parece un gasto fijo del plan
-- (el monto puede moverse un poco respecto del presupuesto).

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS ai_adjustment JSONB;

COMMENT ON COLUMN public.expenses.ai_adjustment IS
  'Propuesta de la IA al detectar un fijo: {status, budget_item_id, item_name, previous_amount, new_amount, reason}';
