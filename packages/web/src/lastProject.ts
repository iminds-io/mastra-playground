const LAST_PROJECT_STORAGE_KEY = 'mastra-mindspace:last-project-id';

export function getLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(projectId: string): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
  } catch {
    // Ignore storage failures so bootstrap routing remains resilient.
  }
}

export function clearLastProjectId(): void {
  try {
    window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
  } catch {
    // Ignore storage failures so bootstrap routing remains resilient.
  }
}
