-- Munyon paycheck plans: one document per authenticated user
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pay_amount numeric not null default 0,
  fixed jsonb not null default '[]'::jsonb,
  paychecks jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  savings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_user_id_key unique (user_id)
);

create index plans_user_id_idx on public.plans (user_id);

create or replace function public.set_plans_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plans_set_updated_at
before update on public.plans
for each row
execute function public.set_plans_updated_at();

alter table public.plans enable row level security;

create policy "Users can select own plan"
  on public.plans
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can insert own plan"
  on public.plans
  for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update own plan"
  on public.plans
  for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete own plan"
  on public.plans
  for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select, insert, update, delete on public.plans to authenticated;
revoke all on public.plans from anon;
