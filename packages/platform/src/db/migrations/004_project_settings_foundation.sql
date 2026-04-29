create table if not exists project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_memberships_project_lookup_idx
  on project_memberships(project_id, role);

create index if not exists project_memberships_user_lookup_idx
  on project_memberships(user_id, project_id);

create table if not exists project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,
  role text not null,
  invited_by_user_id uuid references users(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_invitations_project_lookup_idx
  on project_invitations(project_id, status, created_at desc);

create unique index if not exists project_invitations_active_email_idx
  on project_invitations(project_id, lower(email))
  where status = 'pending';

create table if not exists project_mind_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  agent_id text not null,
  display_name text not null,
  icon text not null default '🤖',
  blurb text,
  enabled boolean not null default true,
  prompt_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, agent_id)
);

create index if not exists project_mind_configs_project_lookup_idx
  on project_mind_configs(project_id, enabled);

insert into project_memberships(project_id, user_id, role)
select
  projects.id,
  organization_memberships.user_id,
  organization_memberships.role
from projects
inner join organization_memberships
  on organization_memberships.organization_id = projects.organization_id
on conflict (project_id, user_id) do update set
  role = excluded.role,
  updated_at = now();

insert into project_mind_configs(project_id, agent_id, display_name, icon, blurb, enabled)
select
  projects.id,
  seeded.agent_id,
  seeded.display_name,
  seeded.icon,
  seeded.blurb,
  true
from projects
cross join (
  values
    ('project-agent', 'Project Agent', '🤖', 'Default project execution assistant'),
    ('librarian', 'Librarian', '📚', 'Guides people through the mindspace'),
    ('summarizer', 'Summarizer', '📝', 'Condenses project knowledge'),
    ('mindspace-reviewer', 'Mindspace Reviewer', '🔍', 'Reviews files and findings'),
    ('mindspace-supervisor', 'Mindspace Supervisor', '🧭', 'Coordinates specialist minds')
) as seeded(agent_id, display_name, icon, blurb)
on conflict (project_id, agent_id) do update set
  display_name = excluded.display_name,
  icon = excluded.icon,
  blurb = excluded.blurb,
  updated_at = now();
