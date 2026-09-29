import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearApiClient } from '../src/services/linear-api';

describe('LinearApiClient', () => {
  const fakeApiKey = 'lin_api_test_key_xyz';
  let client: LinearApiClient;

  beforeEach(() => {
    client = new LinearApiClient(fakeApiKey);
    vi.restoreAllMocks();
  });

  it('initializes headers with Authorization Bearer header', async () => {
    let capturedHeaders: Record<string, string> | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              viewer: { id: 'user_1', name: 'Developer', email: 'dev@test.com' },
              teams: { nodes: [] },
              projects: { nodes: [] },
              issueLabels: { nodes: [] },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const data = await client.getWorkspaceData();
    expect(data.viewer.name).toBe('Developer');
    expect(capturedHeaders?.['Authorization']).toBe(fakeApiKey);
  });

  it('creates an issue with correct teamId, title, labels, and priority', async () => {
    let capturedBody: string | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: 'issue_123',
                  identifier: 'EAS-42',
                  title: '[Bug] API response failure',
                  url: 'https://linear.app/issue/EAS-42',
                  state: { name: 'Todo' },
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const created = await client.createIssue({
      teamId: 'team_easydp',
      title: '[Bug] API response failure',
      description: 'Error 500 when saving data',
      priority: 1,
      labelIds: ['label_repo_api', 'label_api'],
    });

    expect(created.identifier).toBe('EAS-42');
    expect(capturedBody).toContain('team_easydp');
    expect(capturedBody).toContain('[Bug] API response failure');
    expect(capturedBody).toContain('label_repo_api');
  });

  it('handles label creation mutation correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              issueLabelCreate: {
                success: true,
                issueLabel: {
                  id: 'label_new_api',
                  name: 'repo:api',
                  color: '#5E6AD2',
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const label = await client.getOrCreateLabel('repo:api', 'team_easydp');
    expect(label?.id).toBe('label_new_api');
    expect(label?.name).toBe('repo:api');
  });

  it('throws friendly error when API key has invalid scope or permission forbidden', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            errors: [{ message: 'Invalid scope: `write` required' }],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    await expect(
      client.createIssue({
        teamId: 'team_1',
        title: 'Failing issue',
        description: 'Test',
      })
    ).rejects.toThrow('Linear API HTTP error 400');
  });
});
