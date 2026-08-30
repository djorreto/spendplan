-- Gastos en cuotas: un cargo por mes, mismo grupo.
alter table public.expenses
  add column if not exists installment_group_id uuid,
  add column if not exists installment_index integer,
  add column if not exists installment_total integer,
  add column if not exists installment_principal numeric(15,2);

create index if not exists idx_expenses_installment_group
  on public.expenses (household_id, installment_group_id)
  where installment_group_id is not null;

comment on column public.expenses.installment_group_id is 'Same uuid for every month of a purchase in cuotas';
comment on column public.expenses.installment_index is '1-based cuota number';
comment on column public.expenses.installment_total is 'Total cuotas of the purchase';
comment on column public.expenses.installment_principal is 'Original purchase total (cuota * total)';
