create or replace function public.can_access_direct_call_topic(
  channel_topic text,
  target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation_id text;
begin
  if target_user_id is null
    or target_user_id <> (select auth.uid())
    or channel_topic !~ '^inzu-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    return false;
  end if;

  conversation_id := substring(channel_topic from 11);

  return exists (
    select 1
    from public.conversations c
    where c.id = conversation_id::uuid
      and target_user_id in (c.user_one, c.user_two)
  );
end;
$$;

revoke all on function public.can_access_direct_call_topic(text, uuid) from public;
grant execute on function public.can_access_direct_call_topic(text, uuid) to authenticated;

drop policy if exists "Conversation members can receive call signals" on realtime.messages;
create policy "Conversation members can receive call signals"
  on realtime.messages for select to authenticated
  using (public.can_access_direct_call_topic(realtime.topic(), (select auth.uid())));

drop policy if exists "Conversation members can send call signals" on realtime.messages;
create policy "Conversation members can send call signals"
  on realtime.messages for insert to authenticated
  with check (public.can_access_direct_call_topic(realtime.topic(), (select auth.uid())));
