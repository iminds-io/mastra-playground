// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const authState = {
  user: {
    uid: 'firebase-user-1',
    email: 'user@example.com',
    getIdToken: vi.fn(async () => 'demo-token'),
  },
};

vi.mock('./firebase', () => ({
  auth: {},
  onAuthStateChanged: (_auth: unknown, callback: (user: typeof authState.user) => void) => {
    callback(authState.user);
    return () => {};
  },
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock('./api', () => ({
  getMe: vi.fn(async () => ({
    uid: 'firebase-user-1',
    email: 'user@example.com',
    emailVerified: true,
    name: 'Demo User',
  })),
  bootstrapProject: vi.fn(async () => ({
    projectId: 'project-123',
    organizationId: 'org-123',
    workspaceRootPath: '/tmp/project-123',
    binding: {
      activeAgentRef: 'default',
      activeAgentVersion: 'v1',
    },
  })),
  getWorkspace: vi.fn(async (_user: unknown, projectId: string) => ({
    projectId,
  })),
  runAgent: vi.fn(async (_user: unknown, projectId: string, message: string) => ({
    resourceId: `project:${projectId}`,
    workspaceRootPath: `/tmp/${projectId}`,
    threadId: projectId,
    runId: 'run-123',
    modelId: 'openai/gpt-4.1-mini',
    text: `agent heard: ${message}`,
  })),
}));

import { App } from './App';

describe('App', () => {
  it('bootstraps a project and uses the returned project id for agent execution', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /create demo project/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('project-123')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run agent/i }));

    await waitFor(() => {
      const agentResponse = screen.getByText((content, element) => {
        return (
          element?.tagName === 'PRE' &&
          content.includes('"resourceId": "project:project-123"') &&
          content.includes('"text": "agent heard: hello"')
        );
      });

      expect(agentResponse).toBeTruthy();
    });
  });
});
