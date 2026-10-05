create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  constraint posts_content_or_image check (length(trim(content)) > 0 or image_url is not null)
);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('follow', 'like', 'message')),
  post_id uuid references public.posts (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_not_self check (recipient_id <> actor_id),
  constraint notifications_event_target check (
    (event_type = 'follow' and post_id is null and message_id is null)
    or (event_type = 'like' and post_id is not null and message_id is null)
    or (event_type = 'message' and post_id is null and message_id is not null)
  )
);

create index posts_user_created_idx on public.posts (user_id, created_at desc);
create index post_likes_user_idx on public.post_likes (user_id);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.notifications enable row level security;

grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, update on public.notifications to authenticated;

create policy "Signed-in members can view posts"
  on public.posts for select to authenticated using (true);
create policy "Members can create their own posts"
  on public.posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can update their own posts"
  on public.posts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Members can delete their own posts"
  on public.posts for delete to authenticated using (user_id = (select auth.uid()));

create policy "Signed-in members can view post likes"
  on public.post_likes for select to authenticated using (true);
create policy "Members can like posts as themselves"
  on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Members can remove their own likes"
  on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "Members can read their own notifications"
  on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy "Members can mark their own notifications as read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create function public.notify_new_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, event_type)
  values (new.following_id, new.follower_id, 'follow');
  return new;
end;
$$;

create trigger on_follow_created_notify_member
  after insert on public.follows
  for each row execute function public.notify_new_follow();

create function public.notify_post_owner_of_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, event_type, post_id)
    values (post_owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;

create trigger on_post_liked_notify_owner
  after insert on public.post_likes
  for each row execute function public.notify_post_owner_of_like();

create function public.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  select case when user_one = new.sender_id then user_two else user_one end
  into recipient
  from public.conversations
  where id = new.conversation_id
    and new.sender_id in (user_one, user_two);

  if recipient is not null then
    insert into public.notifications (recipient_id, actor_id, event_type, message_id)
    values (recipient, new.sender_id, 'message', new.id);
  end if;
  return new;
end;
$$;

create trigger on_message_created_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_message_recipient();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Post images are publicly viewable" on storage.objects;
drop policy if exists "Members can upload their own post images" on storage.objects;

create policy "Post images are publicly viewable"
  on storage.objects for select to public
  using (bucket_id = 'post-media');

create policy "Members can upload their own post images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
