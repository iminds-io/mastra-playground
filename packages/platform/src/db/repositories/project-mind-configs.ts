import { getDatabasePool } from '../context';

export type ProjectMindConfigRecord = {
  id: string;
  project_id: string;
  agent_id: string;
  display_name: string;
  icon: string;
  blurb: string | null;
  enabled: boolean;
  prompt_override: string | null;
};

const DEFAULT_PROJECT_MINDS = [
  {
    agent_id: 'project-agent',
    display_name: 'Project Agent',
    icon: '🤖',
    blurb: 'Default project execution assistant',
  },
  {
    agent_id: 'librarian',
    display_name: 'Librarian',
    icon: '📚',
    blurb: 'Guides people through the mindspace',
  },
  {
    agent_id: 'summarizer',
    display_name: 'Summarizer',
    icon: '📝',
    blurb: 'Condenses project knowledge',
  },
  {
    agent_id: 'mindspace-reviewer',
    display_name: 'Mindspace Reviewer',
    icon: '🔍',
    blurb: 'Reviews files and findings',
  },
  {
    agent_id: 'mindspace-supervisor',
    display_name: 'Mindspace Supervisor',
    icon: '🧭',
    blurb: 'Coordinates specialist minds',
  },
] as const;

export async function listProjectMindConfigs(projectId: string): Promise<ProjectMindConfigRecord[]> {
  const result = await getDatabasePool().query<ProjectMindConfigRecord>(
    `
      select id, project_id, agent_id, display_name, icon, blurb, enabled, prompt_override
      from project_mind_configs
      where project_id = $1
      order by display_name asc
    `,
    [projectId],
  );

  return result.rows;
}

export async function seedProjectMindConfigs(projectId: string): Promise<ProjectMindConfigRecord[]> {
  const valuesSql = DEFAULT_PROJECT_MINDS.map(
    (_, index) =>
      `($1, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, $${index * 4 + 5}, true)`,
  ).join(', ');
  const params: unknown[] = [projectId];

  for (const mind of DEFAULT_PROJECT_MINDS) {
    params.push(mind.agent_id, mind.display_name, mind.icon, mind.blurb);
  }

  const result = await getDatabasePool().query<ProjectMindConfigRecord>(
    `
      insert into project_mind_configs(project_id, agent_id, display_name, icon, blurb, enabled)
      values ${valuesSql}
      on conflict (project_id, agent_id)
      do update set
        display_name = excluded.display_name,
        icon = excluded.icon,
        blurb = excluded.blurb,
        updated_at = now()
      returning id, project_id, agent_id, display_name, icon, blurb, enabled, prompt_override
    `,
    params,
  );

  return result.rows;
}

export async function getProjectMindConfigById(input: {
  projectId: string;
  mindId: string;
}): Promise<ProjectMindConfigRecord | null> {
  const result = await getDatabasePool().query<ProjectMindConfigRecord>(
    `
      select id, project_id, agent_id, display_name, icon, blurb, enabled, prompt_override
      from project_mind_configs
      where project_id = $1
        and id = $2
      limit 1
    `,
    [input.projectId, input.mindId],
  );

  return result.rows[0] ?? null;
}

export async function updateProjectMindConfig(input: {
  projectId: string;
  mindId: string;
  displayName?: string;
  icon?: string;
  blurb?: string | null;
  enabled?: boolean;
  promptOverride?: string | null;
}): Promise<ProjectMindConfigRecord | null> {
  const assignments: string[] = [];
  const params: unknown[] = [input.projectId, input.mindId];

  if (input.displayName !== undefined) {
    params.push(input.displayName);
    assignments.push(`display_name = $${params.length}`);
  }

  if (input.icon !== undefined) {
    params.push(input.icon);
    assignments.push(`icon = $${params.length}`);
  }

  if (input.blurb !== undefined) {
    params.push(input.blurb);
    assignments.push(`blurb = $${params.length}`);
  }

  if (input.enabled !== undefined) {
    params.push(input.enabled);
    assignments.push(`enabled = $${params.length}`);
  }

  if (input.promptOverride !== undefined) {
    params.push(input.promptOverride);
    assignments.push(`prompt_override = $${params.length}`);
  }

  if (assignments.length === 0) {
    return getProjectMindConfigById({ projectId: input.projectId, mindId: input.mindId });
  }

  const result = await getDatabasePool().query<ProjectMindConfigRecord>(
    `
      update project_mind_configs
      set ${assignments.join(', ')},
          updated_at = now()
      where project_id = $1
        and id = $2
      returning id, project_id, agent_id, display_name, icon, blurb, enabled, prompt_override
    `,
    params,
  );

  return result.rows[0] ?? null;
}
