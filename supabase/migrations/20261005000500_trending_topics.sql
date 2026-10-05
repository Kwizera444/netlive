create index if not exists posts_created_at_idx on public.posts (created_at desc);

create or replace function public.get_trending_topics()
returns table (tag text, moments bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with tagged_posts as (
    select p.id, lower(matches.extracted_tag[1]) as normalized_tag
    from public.posts p
    cross join lateral regexp_matches(p.content, '#([[:alnum:]_]{2,30})', 'g')
      as matches(extracted_tag)
    where p.created_at >= now() - interval '7 days'
  )
  select ('#' || normalized_tag)::text, count(distinct id)::bigint
  from tagged_posts
  group by normalized_tag
  order by count(distinct id) desc, normalized_tag
  limit 5;
$$;

revoke all on function public.get_trending_topics() from public;
grant execute on function public.get_trending_topics() to authenticated;

notify pgrst, 'reload schema';
