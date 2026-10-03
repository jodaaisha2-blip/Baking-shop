-- Run this AFTER schema.sql, in Supabase SQL Editor.
-- Adds a real, database-backed cart (replacing the old browser-only cart),
-- and turns on Realtime so changes sync instantly between the website and
-- the mobile app.

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null unique,
  created_at timestamptz not null default now()
);

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references carts(id) on delete cascade not null,
  product_id uuid references products(id) not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

alter table carts enable row level security;
alter table cart_items enable row level security;

drop policy if exists "Users manage own cart" on carts;
create policy "Users manage own cart" on carts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own cart items" on cart_items;
create policy "Users manage own cart items" on cart_items for all
  using (exists (select 1 from carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()))
  with check (exists (select 1 from carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()));

-- Turn on Realtime for both tables, so INSERT/UPDATE/DELETE events are
-- pushed live to any subscribed client (website or mobile app).
alter publication supabase_realtime add table carts;
alter publication supabase_realtime add table cart_items;
