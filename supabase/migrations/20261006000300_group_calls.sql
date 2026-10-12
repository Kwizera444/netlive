create table public.call_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('voice', 'video')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.call_room_members (
  call_id uuid not null references public.call_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (call_id, user_id)
);

create index call_room_members_user_idx
  on public.call_room_members (user_id, call_id);

alter table public.call_rooms enable row level security;
alter table public.call_room_members enable row level security;

grant select on public.call_rooms, public.call_room_members to authenticated;

create or replace function public.is_call_room_member(target_call_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select target_user_id = auth.uid() and exists (
    select 1 from public.call_room_members m
    where m.call_id = target_call_id and m.user_id = target_user_id
  );
$$;

create or replace function public.is_call_room_owner(target_call_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid() and exists (
    select 1 from public.call_rooms r
    where r.id = target_call_id and r.owner_id = target_user_id
  );
$$;

create or replace function public.can_signal_call_room(target_call_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid() and exists (
    select 1
    from public.call_room_members m
    join public.call_rooms r on r.id = m.call_id
    where m.call_id = target_call_id
      and m.user_id = target_user_id
      and m.joined_at is not null
      and r.ended_at is null
  );
$$;

revoke all on function public.is_call_room_member(uuid, uuid) from public;
revoke all on function public.is_call_room_owner(uuid, uuid) from public;
revoke all on function public.can_signal_call_room(uuid, uuid) from public;
grant execute on function public.is_call_room_member(uuid, uuid) to authenticated;
grant execute on function public.is_call_room_owner(uuid, uuid) to authenticated;
grant execute on function public.can_signal_call_room(uuid, uuid) to authenticated;

create policy "Call room members can view their rooms"
  on public.call_rooms for select to authenticated
  using (public.is_call_room_member(id, (select auth.uid())));

create policy "Call participants can view room members"
  on public.call_room_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_call_room_owner(call_id, (select auth.uid()))
  );

create or replace function public.create_call_room(target_users uuid[], requested_mode text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  room_id uuid;
  unique_users integer;
  valid_users integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before starting a group call.';
  end if;
  if requested_mode not in ('voice', 'video') then
    raise exception 'Choose a voice or video call.';
  end if;
  if coalesce(cardinality(target_users), 0) < 1 or cardinality(target_users) > 7 then
    raise exception 'A group call needs between 1 and 7 other members.';
  end if;
  if current_user_id = any(target_users) then
    raise exception 'Do not include yourself in the invite list.';
  end if;

  select count(distinct invited_id), count(distinct p.id)
    into unique_users, valid_users
  from unnest(target_users) as invited(invited_id)
  left join public.profiles p on p.id = invited.invited_id;

  if unique_users <> cardinality(target_users) or valid_users <> cardinality(target_users) then
    raise exception 'The invite list contains duplicate or unavailable members.';
  end if;

  insert into public.call_rooms (owner_id, mode)
  values (current_user_id, requested_mode)
  returning id into room_id;

  insert into public.call_room_members (call_id, user_id, joined_at)
  values (room_id, current_user_id, now());

  insert into public.call_room_members (call_id, user_id)
  select room_id, invited_id from unnest(target_users) as invited(invited_id);

  return room_id;
end;
$$;

create or replace function public.join_call_room(target_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.call_room_members m
  set joined_at = now()
  from public.call_rooms r
  where m.call_id = target_call_id
    and m.user_id = auth.uid()
    and r.id = m.call_id
    and r.ended_at is null;
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'This group call invitation is no longer available.';
  end if;
end;
$$;

create or replace function public.leave_call_room(target_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.call_room_members m
  set joined_at = null
  from public.call_rooms r
  where m.call_id = target_call_id
    and m.user_id = auth.uid()
    and r.id = m.call_id
    and r.owner_id <> auth.uid()
    and r.ended_at is null;
end;
$$;

create or replace function public.end_call_room(target_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  update public.call_rooms
  set ended_at = now()
  where id = target_call_id and owner_id = auth.uid() and ended_at is null;
  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'Only the group call host can end this room.';
  end if;
end;
$$;

revoke all on function public.create_call_room(uuid[], text) from public;
revoke all on function public.join_call_room(uuid) from public;
revoke all on function public.leave_call_room(uuid) from public;
revoke all on function public.end_call_room(uuid) from public;
grant execute on function public.create_call_room(uuid[], text) to authenticated;
grant execute on function public.join_call_room(uuid) to authenticated;
grant execute on function public.leave_call_room(uuid) to authenticated;
grant execute on function public.end_call_room(uuid) to authenticated;

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
