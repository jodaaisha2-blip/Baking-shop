-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists pgcrypto;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('ingredient', 'equipment')),
  price numeric(10,2) not null,
  unit text not null default 'each',
  stock integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  email text not null,
  full_name text not null,
  address text not null,
  phone text,
  total numeric(10,2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  product_name text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null
);

alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

drop policy if exists "Anyone can view products" on products;
create policy "Anyone can view products" on products for select using (true);

drop policy if exists "Users view own orders" on orders;
create policy "Users view own orders" on orders for select using (auth.uid() = user_id);

drop policy if exists "Users create own orders" on orders;
create policy "Users create own orders" on orders for insert with check (auth.uid() = user_id);

drop policy if exists "Users view own order items" on order_items;
create policy "Users view own order items" on order_items for select using (
  exists (select 1 from orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
);

drop policy if exists "Users create own order items" on order_items;
create policy "Users create own order items" on order_items for insert with check (
  exists (select 1 from orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
);

-- Sample products so the shop isn't empty on first run
insert into products (name, description, category, price, unit, stock) values
  ('All-Purpose Flour', 'Finely milled wheat flour, ideal for cakes, bread, and pastry.', 'ingredient', 3500, '2kg bag', 60),
  ('Unsalted Butter', 'Creamy, high-fat butter for laminated dough and buttercream.', 'ingredient', 2800, '500g block', 40),
  ('Granulated Sugar', 'Fine white sugar for baking and creaming.', 'ingredient', 2200, '1kg bag', 55),
  ('Baking Powder', 'Double-acting leavening agent.', 'ingredient', 900, '200g tin', 80),
  ('Cocoa Powder', 'Unsweetened dark cocoa for rich chocolate bakes.', 'ingredient', 3200, '250g bag', 35),
  ('Vanilla Extract', 'Pure vanilla extract, no artificial flavoring.', 'ingredient', 4500, '100ml bottle', 25),
  ('Stand Mixer', '5-litre bowl, 6-speed motor, dough hook included.', 'equipment', 185000, 'unit', 8),
  ('Digital Kitchen Scale', 'Precise to 1g, up to 5kg capacity.', 'equipment', 12000, 'unit', 20),
  ('9-inch Springform Pan', 'Non-stick, removable base, for cakes and cheesecakes.', 'equipment', 8500, 'unit', 30),
  ('Silicone Piping Bag Set', 'Reusable, with 6 stainless steel nozzles.', 'equipment', 6000, 'set', 45),
  ('Oven Thermometer', 'Accurate temperature reading for consistent bakes.', 'equipment', 3000, 'unit', 50),
  ('Cooling Rack', 'Stainless steel wire rack, fits standard half sheet pans.', 'equipment', 4500, 'unit', 38)
on conflict do nothing;
