create table if not exists project_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null,
  slug text not null,
  description text,
  kind text not null default 'chat',
  is_private boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table if not exists channel_threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references project_channels(id),
  owner_user_id uuid references users(id),
  title text,
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channel_threads_channel_lookup_idx
  on channel_threads(channel_id, updated_at desc);
