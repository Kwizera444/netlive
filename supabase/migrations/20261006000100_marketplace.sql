create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  description text not null default '' check (length(description) <= 2000),
  listing_type text not null check (listing_type in ('product', 'service')),
  category text not null check (length(trim(category)) between 2 and 50),
  price_rwf numeric(12, 2) not null check (price_rwf > 0),
  location text not null check (length(trim(location)) between 2 and 100),
  payment_method text not null check (payment_method in ('MTN Mobile Money', 'Airtel Money')),
  payment_number text not null check (
    length(trim(payment_number)) between 3 and 40
    and payment_number ~ '^[A-Za-z0-9+*#(). -]+$'
  ),
  created_at timestamptz not null default now()
);

create index marketplace_listings_created_idx
  on public.marketplace_listings (created_at desc);
create index marketplace_listings_category_idx
  on public.marketplace_listings (category, created_at desc);
create index marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id, created_at desc);

alter table public.marketplace_listings enable row level security;
grant select, insert, delete on public.marketplace_listings to authenticated;

create policy "Signed-in members can browse marketplace listings"
  on public.marketplace_listings for select to authenticated using (true);
create policy "Members can publish marketplace listings as themselves"
  on public.marketplace_listings for insert to authenticated
  with check (seller_id = (select auth.uid()));
create policy "Members can remove their own marketplace listings"
  on public.marketplace_listings for delete to authenticated
  using (seller_id = (select auth.uid()));

notify pgrst, 'reload schema';
