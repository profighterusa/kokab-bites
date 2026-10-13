-- KOKAB BITES — Supabase schema
-- Run once in the Supabase SQL editor (or via psql).
-- The API uses the service_role key server-side; the browser never talks
-- to Supabase directly, so RLS stays locked down (no public policies).

-- Generic document store for the menu (exact shape the frontend expects)
create table if not exists app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Orders: full order payload as JSONB (same shape as the original orders.json)
create table if not exists orders (
  id text primary key,
  payload jsonb not null,
  status text not null default 'New',
  created_at timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);

-- Fixed-window rate limiter for POST /api/orders
create table if not exists rate_limits (
  ip text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (ip, window_start)
);

-- Lock everything down: only service_role (server API) can read/write.
alter table app_state enable row level security;
alter table orders enable row level security;
alter table rate_limits enable row level security;

-- Product images bucket (public read, service_role write via API)
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create policy "public read uploads"
  on storage.objects for select
  using (bucket_id = 'uploads');
