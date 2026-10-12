create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint statuses_content_or_image check (length(trim(content)) > 0 or image_path is not null),
  constraint statuses_content_length check (length(content) <= 500),
  constraint statuses_expire_within_day check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  )
);

create table public.status_views (
  status_id uuid not null references public.statuses (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create table public.status_reactions (
  status_id uuid not null references public.statuses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '😮', '👏')),
  created_at timestamptz not null default now(),
  primary key (status_id, user_id)
);

alter table public.messages
  add column if not exists status_id uuid references public.statuses (id) on delete set null,
  add column if not exists status_reply_content text;

create index statuses_user_expiry_idx on public.statuses (user_id, expires_at desc);
create index status_views_status_idx on public.status_views (status_id, viewed_at desc);
create index status_reactions_status_idx on public.status_reactions (status_id);

alter table public.statuses enable row level security;
alter table public.status_views enable row level security;
alter table public.status_reactions enable row level security;

grant select, insert, delete on public.statuses to authenticated;
grant select, insert on public.status_views to authenticated;
grant select, insert, update, delete on public.status_reactions to authenticated;

create policy "Members can view their active statuses and followed statuses"
  on public.statuses for select to authenticated using (
    expires_at > now()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = statuses.user_id
      )
    )
  );

create policy "Members can publish their own statuses"
  on public.statuses for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Members can delete their own statuses"
  on public.statuses for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Status owners and viewers can see their view records"
  on public.status_views for select to authenticated using (
    viewer_id = (select auth.uid())
    or exists (
      select 1 from public.statuses s
      where s.id = status_id and s.user_id = (select auth.uid())
    )
  );

create policy "Members can record views of followed active statuses"
  on public.status_views for insert to authenticated with check (
    viewer_id = (select auth.uid())
    and exists (
      select 1 from public.statuses s
      join public.follows f
        on f.following_id = s.user_id
       and f.follower_id = (select auth.uid())
      where s.id = status_id
        and s.user_id <> (select auth.uid())
        and s.expires_at > now()
    )
  );

create policy "Status participants can see reactions"
  on public.status_reactions for select to authenticated using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.statuses s
      where s.id = status_id
        and (
          s.user_id = (select auth.uid())
          or exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid())
              and f.following_id = s.user_id
          )
        )
    )
  );

create policy "Members can react to followed active statuses"
  on public.status_reactions for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.statuses s
      join public.follows f
        on f.following_id = s.user_id
       and f.follower_id = (select auth.uid())
      where s.id = status_id
        and s.user_id <> (select auth.uid())
        and s.expires_at > now()
    )
  );

create policy "Members can update their own status reactions"
  on public.status_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.statuses s
      join public.follows f
        on f.following_id = s.user_id
       and f.follower_id = (select auth.uid())
      where s.id = status_id
        and s.user_id <> (select auth.uid())
        and s.expires_at > now()
    )
  );

create policy "Members can remove their own status reactions"
  on public.status_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'status-media',
  'status-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Status photos are visible to status followers" on storage.objects;
drop policy if exists "Members can upload their own status photos" on storage.objects;
drop policy if exists "Members can delete their own status photos" on storage.objects;

create policy "Status photos are visible to status followers"
  on storage.objects for select to authenticated using (
    bucket_id = 'status-media'
    and exists (
      select 1 from public.statuses s
      where s.id::text = (storage.foldername(name))[2]
        and s.user_id::text = (storage.foldername(name))[1]
        and s.expires_at > now()
        and (
          s.user_id = (select auth.uid())
          or exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid())
              and f.following_id = s.user_id
          )
        )
    )
  );

create policy "Members can upload their own status photos"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'status-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members can delete their own status photos"
  on storage.objects for delete to authenticated using (
    bucket_id = 'status-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create function public.reply_to_status(target_status_id uuid, reply_content text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_owner uuid;
  status_content text;
  conversation uuid;
  sent_message public.messages;
begin
  if auth.uid() is null or nullif(trim(reply_content), '') is null or length(trim(reply_content)) > 2000 then
    raise exception 'A signed-in member and a non-empty reply are required.';
  end if;

  select s.user_id, s.content
    into status_owner, status_content
  from public.statuses s
  where s.id = target_status_id
    and s.expires_at > now()
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = s.user_id
    );

  if status_owner is null or status_owner = auth.uid() then
    raise exception 'This status is unavailable or you cannot reply to it.';
  end if;

  conversation := public.get_or_create_direct_conversation(status_owner);

  insert into public.messages (
    conversation_id, sender_id, content, status_id, status_reply_content
  )
  values (
    conversation, auth.uid(), trim(reply_content), target_status_id,
    coalesce(nullif(trim(status_content), ''), 'Photo status')
  )
  returning * into sent_message;

  return sent_message;
end;
$$;

revoke all on function public.reply_to_status(uuid, text) from public;
grant execute on function public.reply_to_status(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'statuses'
  ) then
    alter publication supabase_realtime add table public.statuses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'status_views'
  ) then
    alter publication supabase_realtime add table public.status_views;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'status_reactions'
  ) then
    alter publication supabase_realtime add table public.status_reactions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
