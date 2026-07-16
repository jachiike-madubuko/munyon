-- Normalized Munyon schema (single-user, passcode-gated app)
-- Applied remotely via MCP as normalize_munyon_tables

create table if not exists public.plan_settings (
  id text primary key default 'default',
  pay_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_costs (
  id text primary key,
  name text not null,
  cost numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paychecks (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  color text not null default '#E11D2E',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  name text not null,
  cost numeric not null default 0,
  paycheck_id text references public.paychecks (id) on delete set null,
  paid boolean not null default false,
  link text not null default '',
  split_group text,
  split_index int,
  split_of int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_paycheck_id_idx on public.expenses (paycheck_id);
create index if not exists expenses_split_group_idx on public.expenses (split_group);

create table if not exists public.expense_categories (
  expense_id text not null references public.expenses (id) on delete cascade,
  category_id text not null references public.categories (id) on delete cascade,
  primary key (expense_id, category_id)
);

create table if not exists public.savings_buckets (
  id text primary key,
  name text not null,
  balance numeric not null default 0,
  deposit numeric not null default 0,
  borrowed numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
