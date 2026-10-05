drop policy if exists "Conversation members can receive call signals" on realtime.messages;
drop policy if exists "Conversation members can send call signals" on realtime.messages;

create policy "Conversation members can receive call signals"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'inzu-call:%'
    and exists (
      select 1
      from public.conversations c
      where c.id::text = substring(realtime.topic() from 11)
        and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );

create policy "Conversation members can send call signals"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'inzu-call:%'
    and exists (
      select 1
      from public.conversations c
      where c.id::text = substring(realtime.topic() from 11)
        and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
