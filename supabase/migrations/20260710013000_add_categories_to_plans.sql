alter table public.plans
  add column if not exists categories jsonb not null default '[]'::jsonb;
