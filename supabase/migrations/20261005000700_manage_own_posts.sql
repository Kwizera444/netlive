drop policy if exists "Members can delete their own post images" on storage.objects;

create policy "Members can delete their own post images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
