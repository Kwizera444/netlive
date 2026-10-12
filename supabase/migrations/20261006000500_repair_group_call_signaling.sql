create or replace function public.can_signal_call_room(
  target_call_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) and exists (
    select 1
    from public.call_room_members m
    join public.call_rooms r on r.id = m.call_id
    where m.call_id = target_call_id
      and m.user_id = target_user_id
      and m.joined_at is not null
      and r.ended_at is null
  );
$$;

revoke all on function public.can_signal_call_room(uuid, uuid) from public;
grant execute on function public.can_signal_call_room(uuid, uuid) to authenticated;

drop policy if exists "Group call members can receive signaling" on realtime.messages;
create policy "Group call members can receive signaling"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'inzu-group-call:%'
    and substring(realtime.topic() from 17) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_signal_call_room(substring(realtime.topic() from 17)::uuid, (select auth.uid()))
  );

drop policy if exists "Group call members can send signaling" on realtime.messages;
create policy "Group call members can send signaling"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'inzu-group-call:%'
    and substring(realtime.topic() from 17) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.can_signal_call_room(substring(realtime.topic() from 17)::uuid, (select auth.uid()))
  );
