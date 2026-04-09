create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  firebase_project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  email text,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  slug text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists workspace_roots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null references projects(id),
  storage_type text not null,
  root_path text not null,
  status text not null,
  filesystem_provider_type text not null,
  sandbox_provider_type text not null,
  is_read_only boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_roots_active_project_idx
  on workspace_roots(project_id)
  where archived_at is null;

create table if not exists workspace_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  workspace_root_id uuid not null references workspace_roots(id),
  editor_workspace_ref text,
  active_agent_ref text not null,
  active_agent_version text not null,
  policy_json jsonb not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_bindings_active_project_idx
  on workspace_bindings(project_id)
  where archived_at is null;

create table if not exists workspace_locks (
  id uuid primary key default gen_random_uuid(),
  workspace_root_id uuid not null references workspace_roots(id),
  lock_type text not null,
  holder text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_locks_lookup_idx
  on workspace_locks(workspace_root_id, expires_at);

create table if not exists workspace_events (
  id uuid primary key default gen_random_uuid(),
  workspace_root_id uuid not null references workspace_roots(id),
  event_type text not null,
  actor_user_id uuid references users(id),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspace_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_root_id uuid not null references workspace_roots(id),
  requested_by uuid references users(id),
  status text not null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
