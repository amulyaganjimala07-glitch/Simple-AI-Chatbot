-- Run this once in the Supabase SQL Editor for the project connected to this app.
-- App access uses the server-only service-role key. RLS stays enabled with no
-- public/anonymous policies, so browser clients cannot read or write chat rows.

create table if not exists public.morrow_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.morrow_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.morrow_conversations(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence)
);

create index if not exists morrow_conversations_owner_updated_idx
  on public.morrow_conversations (owner_id, updated_at desc);

create index if not exists morrow_messages_conversation_sequence_idx
  on public.morrow_messages (conversation_id, sequence);

alter table public.morrow_conversations enable row level security;
alter table public.morrow_messages enable row level security;

revoke all on public.morrow_conversations from anon, authenticated;
revoke all on public.morrow_messages from anon, authenticated;
grant select, insert, update, delete on public.morrow_conversations to service_role;
grant select, insert, update, delete on public.morrow_messages to service_role;
