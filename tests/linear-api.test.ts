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
              teams: {
                nodes: [
                  {
                    id: 'team_1',
                    name: 'Engineering',
                    key: 'ENG',
                    states: {
                      nodes: [
                        { id: 's_todo', name: 'Todo', color: '#f2994a', type: 'unstarted', position: 2 },
                        { id: 's_backlog', name: 'Backlog', color: '#bec2c8', type: 'backlog', position: 1 },
                      ],
                    },
                    labels: { nodes: [] },
                  },
                ],
              },
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
    expect(data.teams[0].states).toHaveLength(2);
    expect(data.teams[0].states?.[0].id).toBe('s_backlog');
    expect(data.teams[0].states?.[1].id).toBe('s_todo');
  });

  it('creates an issue with correct teamId, title, labels, priority, and stateId', async () => {
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
      stateId: 'state_todo_123',
      labelIds: ['label_repo_api', 'label_api'],
    });

    expect(created.identifier).toBe('EAS-42');
    expect(capturedBody).toContain('team_easydp');
    expect(capturedBody).toContain('[Bug] API response failure');
    expect(capturedBody).toContain('label_repo_api');
    expect(capturedBody).toContain('state_todo_123');
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

  it('recovers gracefully when label already exists (duplicate label name error)', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Mutation fails with duplicate label name error
        return Promise.resolve(
          new Response(
            JSON.stringify({
              errors: [{ message: 'duplicate label name' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      // Followup query finds existing label
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              issueLabels: {
                nodes: [
                  { id: 'label_existing_eng', name: 'Engineering', color: '#5E6AD2' },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const label = await client.getOrCreateLabel('Engineering', 'team_1');
    expect(label?.id).toBe('label_existing_eng');
    expect(label?.name).toBe('Engineering');
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

  it('bulk fetches workflow states for multiple issues using aliased query in a single request', async () => {
    let capturedBody: string | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedBody = init?.body as string;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              i0: {
                id: 'uuid_1',
                identifier: 'CR-101',
                title: 'Login button broken',
                archivedAt: null,
                state: { id: 's_todo', name: 'Todo', color: '#f2994a', type: 'unstarted' },
              },
              i1: {
                id: 'uuid_2',
                identifier: 'CR-208',
                title: '[Bug] platform overview',
                archivedAt: null,
                state: { id: 's_done', name: 'Done', color: '#38ef7d', type: 'completed' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const result = await client.getIssuesStates(['CR-101', 'CR-208']);
    expect(result.size).toBeGreaterThanOrEqual(2);
    // Can lookup by identifier
    expect(result.get('CR-101')?.state.name).toBe('Todo');
    expect(result.get('CR-208')?.state.name).toBe('Done');
    expect(result.get('CR-208')?.state.type).toBe('completed');
    // Can lookup by UUID
    expect(result.get('uuid_1')?.state.name).toBe('Todo');
    expect(result.get('uuid_2')?.state.name).toBe('Done');

    expect(capturedBody).toContain('i0: issue(id: $id0)');
    expect(capturedBody).toContain('i1: issue(id: $id1)');
    expect(capturedBody).toContain('CR-101');
    expect(capturedBody).toContain('CR-208');
  });

  it('recovers partial data gracefully when some issues have GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              i0: {
                id: 'uuid_done',
                identifier: 'CR-208',
                title: '[Bug] platform overview',
                archivedAt: null,
                state: { id: 's_done', name: 'Done', color: '#38ef7d', type: 'completed' },
              },
              i1: null,
            },
            errors: [
              {
                message: 'Entity not found',
                locations: [{ line: 2, column: 3 }],
                path: ['i1'],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const result = await client.getIssuesStates(['CR-208', 'NON_EXISTENT_ID']);
    expect(result.has('CR-208')).toBe(true);
    expect(result.get('CR-208')?.state.name).toBe('Done');
    expect(result.has('NON_EXISTENT_ID')).toBe(false);
  });

  it('correctly tags archived issues with isArchived: true', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              i0: {
                id: 'uuid_archived',
                identifier: 'CR-148',
                title: 'Old ticket',
                archivedAt: '2026-10-10T12:00:00.000Z',
                state: { id: 's_done', name: 'Done', color: '#38ef7d', type: 'completed' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const result = await client.getIssuesStates(['CR-148']);
    expect(result.get('CR-148')?.isArchived).toBe(true);
    expect(result.get('CR-148')?.state.name).toBe('Done');
  });
});
