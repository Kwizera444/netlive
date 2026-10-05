create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null,
  city text not null default 'Kigali, Rwanda',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles (id) on delete cascade,
  user_two uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_users check (user_one < user_two),
  constraint conversations_unique_pair unique (user_one, user_two)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  attachment_name text,
  created_at timestamptz not null default now(),
  constraint messages_content_or_attachment check (length(trim(content)) > 0 or attachment_name is not null)
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index follows_following_idx on public.follows (following_id);

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

create policy "Profiles are visible to signed-in members"
  on public.profiles for select to authenticated using (true);
create policy "Members can update their own profile"
  on public.profiles for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy "Members can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "Members can view follow relationships"
  on public.follows for select to authenticated using (true);
create policy "Members can follow other people"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and follower_id <> following_id);
create policy "Members can unfollow people"
  on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

create policy "Conversation participants can read conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_one, user_two));

create policy "Conversation participants can read messages"
  on public.messages for select to authenticated using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );
create policy "Conversation participants can send as themselves"
  on public.messages for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
    )
  );

create function public.create_profile_for_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_name text;
  base_username text;
begin
  member_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'member'), '@', 1)
  );
  base_username := regexp_replace(lower(member_name), '[^a-z0-9]+', '.', 'g');
  base_username := trim(both '.' from base_username);
  if base_username = '' then
    base_username := 'member';
  end if;

  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    left(base_username, 42) || '.' || left(replace(new.id::text, '-', ''), 8),
    member_name
  );
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_member();

create function public.get_or_create_direct_conversation(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  conversation_id uuid;
begin
  if current_user_id is null or target_user is null or current_user_id = target_user then
    raise exception 'A valid other member is required';
  end if;

  insert into public.conversations (user_one, user_two)
  values (least(current_user_id, target_user), greatest(current_user_id, target_user))
  on conflict (user_one, user_two)
  do update set updated_at = now()
  returning id into conversation_id;

  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create function public.bump_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
