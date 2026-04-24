alter table if exists workspace_bindings
  rename column workspace_root_id to mindspace_root_id;
alter table if exists workspace_bindings
  rename column editor_workspace_ref to editor_mindspace_ref;
alter table if exists workspace_events
  rename column workspace_root_id to mindspace_root_id;
alter table if exists workspace_locks
  rename column workspace_root_id to mindspace_root_id;
alter table if exists workspace_provisioning_jobs
  rename column workspace_root_id to mindspace_root_id;

alter table if exists workspace_roots rename to mindspace_roots;
alter table if exists workspace_bindings rename to mindspace_bindings;
alter table if exists workspace_locks rename to mindspace_locks;
alter table if exists workspace_events rename to mindspace_events;
alter table if exists workspace_provisioning_jobs rename to mindspace_provisioning_jobs;

alter index if exists workspace_roots_active_project_idx
  rename to mindspace_roots_active_project_idx;
alter index if exists workspace_bindings_active_project_idx
  rename to mindspace_bindings_active_project_idx;
alter index if exists workspace_locks_lookup_idx
  rename to mindspace_locks_lookup_idx;
