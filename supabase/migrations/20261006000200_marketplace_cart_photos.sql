alter table public.marketplace_listings
  add column if not exists quantity_available integer not null default 1
    check (quantity_available between 1 and 9999),
  add column if not exists image_path text;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_image_path_owner;
alter table public.marketplace_listings
  add constraint marketplace_listings_image_path_owner
  check (image_path is null or image_path like seller_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-images',
  'marketplace-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can view marketplace photos" on storage.objects;
create policy "Members can view marketplace photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'marketplace-images');

drop policy if exists "Members can upload their marketplace photos" on storage.objects;
create policy "Members can upload their marketplace photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketplace-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Members can delete their marketplace photos" on storage.objects;
create policy "Members can delete their marketplace photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketplace-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
