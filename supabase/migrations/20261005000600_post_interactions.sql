create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.post_reposts (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_comments_post_created_idx on public.post_comments (post_id, created_at);
create index post_reposts_user_idx on public.post_reposts (user_id);

alter table public.post_comments enable row level security;
alter table public.post_reposts enable row level security;

grant select, insert, delete on public.post_comments to authenticated;
grant select, insert, delete on public.post_reposts to authenticated;

create policy "Signed-in members can view post comments"
  on public.post_comments for select to authenticated using (true);
create policy "Members can comment as themselves"
  on public.post_comments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Members can remove their own comments"
  on public.post_comments for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Signed-in members can view post reposts"
  on public.post_reposts for select to authenticated using (true);
create policy "Members can repost as themselves"
  on public.post_reposts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Members can remove their own reposts"
  on public.post_reposts for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_post_interaction_counts(post_ids uuid[])
returns table (
  post_id uuid,
  comments_count bigint,
  reposts_count bigint,
  reposted boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select requested.id,
    (select count(*) from public.post_comments c where c.post_id = requested.id),
    (select count(*) from public.post_reposts r where r.post_id = requested.id),
    exists (
      select 1 from public.post_reposts r
      where r.post_id = requested.id and r.user_id = (select auth.uid())
    )
  from unnest(coalesce(post_ids, array[]::uuid[])) as requested(id);
$$;

revoke all on function public.get_post_interaction_counts(uuid[]) from public;
grant execute on function public.get_post_interaction_counts(uuid[]) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['post_comments', 'post_reposts']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
