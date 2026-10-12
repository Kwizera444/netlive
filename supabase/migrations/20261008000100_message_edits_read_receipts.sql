alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists read_at timestamptz;

alter table public.messages replica identity full;

create or replace function public.edit_direct_message(
  target_message_id uuid,
  new_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null or nullif(trim(new_content), '') is null then
    raise exception 'A signed-in sender and non-empty message are required.';
  end if;

  update public.messages m
  set content = trim(new_content),
      edited_at = now()
  where m.id = target_message_id
    and m.sender_id = auth.uid()
    and exists (
      select 1
      from public.conversations c
      where c.id = m.conversation_id
        and auth.uid() in (c.user_one, c.user_two)
    );

  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'The message was not found or you are not its sender.';
  end if;
end;
$$;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and auth.uid() in (c.user_one, c.user_two)
  ) then
    raise exception 'You are not a member of this conversation.';
  end if;

  update public.messages m
  set read_at = now()
  where m.conversation_id = target_conversation_id
    and m.sender_id <> auth.uid()
    and m.read_at is null;
end;
$$;

revoke all on function public.edit_direct_message(uuid, text) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.edit_direct_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.bump_conversation_updated_at_after_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.bump_conversation_updated_at_after_edit() from public;

drop trigger if exists on_message_edited_bump_conversation on public.messages;
create trigger on_message_edited_bump_conversation
  after update of content on public.messages
  for each row
  when (old.content is distinct from new.content)
  execute function public.bump_conversation_updated_at_after_edit();
