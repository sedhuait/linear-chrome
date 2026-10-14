import {
  CreatedIssue,
  FileUploadPayload,
  IssueCreateInput,
  LinearLabel,
  LinearWorkspaceData,
  LinearWorkflowState,
} from '../types/linear';

export class LinearApiClient {
  private apiKey: string;
  private endpoint = 'https://api.linear.app/graphql';

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  private async fetchGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Linear API key is not configured. Please set your Personal API Key in settings.');
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Linear API HTTP error ${res.status}: ${errorText || res.statusText}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      const msg = json.errors.map((e: { message: string }) => e.message).join(', ');
      throw new Error(`Linear GraphQL Error: ${msg}`);
    }

    return json.data as T;
  }

  async getWorkspaceData(): Promise<LinearWorkspaceData> {
    const query = `
      query GetWorkspaceData {
        viewer {
          id
          name
          email
          avatarUrl
        }
        teams(first: 25) {
          nodes {
            id
            name
            key
            color
            states(first: 15) {
              nodes {
                id
                name
                color
                type
                position
              }
            }
            labels(first: 30) {
              nodes {
                id
                name
                color
              }
            }
          }
        }
        projects(first: 50) {
          nodes {
            id
            name
            state
            icon
            color
            teams(first: 5) {
              nodes {
                id
              }
            }
          }
        }
        issueLabels(first: 50) {
          nodes {
            id
            name
            color
          }
        }
      }
    `;

    interface QueryResponse {
      viewer: {
        id: string;
        name: string;
        email: string;
        avatarUrl?: string;
      };
      teams: {
        nodes: Array<{
          id: string;
          name: string;
          key: string;
          color?: string;
          states?: {
            nodes: Array<{
              id: string;
              name: string;
              color: string;
              type: string;
              position?: number;
            }>;
          };
          labels: {
            nodes: Array<{ id: string; name: string; color: string }>;
          };
        }>;
      };
      projects: {
        nodes: Array<{
          id: string;
          name: string;
          state: string;
          icon?: string;
          color?: string;
          teams: {
            nodes: Array<{ id: string }>;
          };
        }>;
      };
      issueLabels?: {
        nodes: Array<{ id: string; name: string; color: string }>;
      };
    }

    const data = await this.fetchGraphQL<QueryResponse>(query);

    const allProjectsMap = new Map<string, {
      id: string;
      name: string;
      state: string;
      icon?: string;
      color?: string;
      teamIds: string[];
    }>();

    // Collect all projects
    for (const p of data.projects.nodes) {
      allProjectsMap.set(p.id, {
        id: p.id,
        name: p.name,
        state: p.state,
        icon: p.icon,
        color: p.color,
        teamIds: p.teams.nodes.map(t => t.id),
      });
    }

    const teams = data.teams.nodes.map(team => {
      // Merge projects belonging to this team
      const teamProjects = Array.from(allProjectsMap.values()).filter(p =>
        p.teamIds.includes(team.id)
      );

      const teamStates = team.states?.nodes
        ? [...team.states.nodes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : [];

      return {
        id: team.id,
        name: team.name,
        key: team.key,
        color: team.color,
        states: teamStates,
        labels: team.labels.nodes,
        projects: teamProjects,
      };
    });

    const allLabelsMap = new Map<string, LinearLabel>();
    if (data.issueLabels?.nodes) {
      for (const l of data.issueLabels.nodes) {
        allLabelsMap.set(l.id, l);
      }
    }
    for (const t of teams) {
      for (const l of t.labels) {
        allLabelsMap.set(l.id, l);
      }
    }

    return {
      viewer: data.viewer,
      teams,
      projects: Array.from(allProjectsMap.values()),
      labels: Array.from(allLabelsMap.values()),
    };
  }

  async getOrCreateLabel(name: string, teamId?: string, color = '#5E6AD2'): Promise<LinearLabel | null> {
    const mutation = `
      mutation IssueLabelCreate($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel {
            id
            name
            color
          }
        }
      }
    `;

    interface LabelCreateResponse {
      issueLabelCreate: {
        success: boolean;
        issueLabel?: LinearLabel;
      };
    }

    try {
      const input: { name: string; color: string; teamId?: string } = { name, color };
      if (teamId) {
        input.teamId = teamId;
      }
      const res = await this.fetchGraphQL<LabelCreateResponse>(mutation, { input });
      if (res.issueLabelCreate?.success && res.issueLabelCreate?.issueLabel) {
        return res.issueLabelCreate.issueLabel;
      }
      return null;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      // If label already exists (duplicate label name), query Linear to find its ID
      if (errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already exists')) {
        try {
          const findQuery = `
            query FindLabel($name: String!) {
              issueLabels(filter: { name: { eq: $name } }, first: 5) {
                nodes {
                  id
                  name
                  color
                }
              }
            }
          `;
          const findRes = await this.fetchGraphQL<{ issueLabels: { nodes: LinearLabel[] } }>(findQuery, { name });
          const matching = findRes?.issueLabels?.nodes?.find(
            (l) => l.name.toLowerCase() === name.toLowerCase()
          ) || findRes?.issueLabels?.nodes?.[0];
          if (matching) {
            return matching;
          }
        } catch {
          // ignore lookup error and proceed
        }
      } else {
        console.warn('Could not create label in Linear:', errMsg);
      }
      return null;
    }
  }

  async uploadScreenshot(blob: Blob, filename = 'screenshot.png'): Promise<string> {
    const mutation = `
      mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
        fileUpload(contentType: $contentType, filename: $filename, size: $size) {
          success
          uploadFile {
            uploadUrl
            assetUrl
            headers {
              key
              value
            }
          }
        }
      }
    `;

    interface FileUploadResponse {
      fileUpload: {
        success: boolean;
        uploadFile: FileUploadPayload;
      };
    }

    const response = await this.fetchGraphQL<FileUploadResponse>(mutation, {
      contentType: blob.type || 'image/png',
      filename,
      size: blob.size,
    });

    if (!response.fileUpload || !response.fileUpload.success || !response.fileUpload.uploadFile) {
      throw new Error('Linear failed to prepare file upload.');
    }

    const { uploadUrl, assetUrl, headers } = response.fileUpload.uploadFile;

    // Convert headers array to Record
    const headerRecord: Record<string, string> = {};
    if (Array.isArray(headers)) {
      for (const h of headers) {
        headerRecord[h.key] = h.value;
      }
    }
    if (!headerRecord['Content-Type']) {
      headerRecord['Content-Type'] = blob.type || 'image/png';
    }

    // Direct HTTP PUT to uploadUrl
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: headerRecord,
      body: blob,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(`Failed to upload to asset storage (HTTP ${uploadRes.status}): ${errText || uploadRes.statusText}`);
    }

    return assetUrl;
  }

  async createIssue(input: IssueCreateInput): Promise<CreatedIssue> {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
          }
        }
      }
    `;

    interface IssueCreateResponse {
      issueCreate: {
        success: boolean;
        issue: CreatedIssue;
      };
    }

    const response = await this.fetchGraphQL<IssueCreateResponse>(mutation, { input });

    if (!response.issueCreate.success || !response.issueCreate.issue) {
      throw new Error('Failed to create Linear issue.');
    }

    return response.issueCreate.issue;
  }

  async createAttachment(issueId: string, title: string, url: string): Promise<void> {
    const mutation = `
      mutation CreateAttachment($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) {
          success
        }
      }
    `;

    try {
      await this.fetchGraphQL(mutation, {
        input: {
          issueId,
          title,
          url,
        },
      });
    } catch (e) {
      console.warn('Linear attachment creation warning (non-fatal):', e);
    }
  }

  async getIssuesStates(
    issueIds: string[]
  ): Promise<Map<string, { state: LinearWorkflowState; title?: string; isArchived?: boolean }>> {
    const map = new Map<string, { state: LinearWorkflowState; title?: string; isArchived?: boolean }>();
    if (!issueIds || issueIds.length === 0) return map;

    // Bulk query filtering by IDs with includeArchived: true so completed/archived tickets are found!
    const query = `
      query GetIssuesStatus($ids: [String!]!, $first: Int!) {
        issues(filter: { id: { in: $ids } }, includeArchived: true, first: $first) {
          nodes {
            id
            identifier
            title
            archivedAt
            state {
              id
              name
              color
              type
              position
            }
          }
        }
      }
    `;

    interface IssuesStatusResponse {
      issues: {
        nodes: Array<{
          id: string;
          identifier?: string;
          title?: string;
          archivedAt?: string | null;
          state: LinearWorkflowState;
        }>;
      };
    }

    // Chunk in batches of 50 to safely stay within Linear query limits
    for (let i = 0; i < issueIds.length; i += 50) {
      const batch = issueIds.slice(i, i + 50);
      try {
        const res = await this.fetchGraphQL<IssuesStatusResponse>(query, {
          ids: batch,
          first: batch.length,
        });

        if (res?.issues?.nodes) {
          for (const item of res.issues.nodes) {
            if (item.state) {
              const entry = {
                state: item.state,
                title: item.title,
                isArchived: Boolean(item.archivedAt),
              };
              if (item.id) map.set(item.id, entry);
              if (item.identifier) map.set(item.identifier.toUpperCase(), entry);
            }
          }
        }
      } catch (e) {
        console.warn('Could not bulk fetch issue statuses:', e);
      }
    }

    // Fallback: If any candidates weren't matched in bulk (e.g. if ticket was stored with human identifier like CR-208),
    // query Linear's single issue resolver which natively supports identifiers like "CR-208" and archived issues
    const unmapped = issueIds.filter((id) => !map.has(id) && !map.has(id.toUpperCase()));
    for (const missingId of unmapped.slice(0, 10)) {
      try {
        const singleQuery = `
          query GetSingleIssue($id: String!) {
            issue(id: $id) {
              id
              identifier
              title
              archivedAt
              state {
                id
                name
                color
                type
                position
              }
            }
          }
        `;
        const singleRes = await this.fetchGraphQL<{
          issue?: {
            id: string;
            identifier?: string;
            title?: string;
            archivedAt?: string | null;
            state?: LinearWorkflowState;
          };
        }>(singleQuery, { id: missingId });

        if (singleRes?.issue?.state) {
          const entry = {
            state: singleRes.issue.state,
            title: singleRes.issue.title,
            isArchived: Boolean(singleRes.issue.archivedAt),
          };
          map.set(singleRes.issue.id, entry);
          map.set(missingId, entry);
          if (singleRes.issue.identifier) {
            map.set(singleRes.issue.identifier.toUpperCase(), entry);
          }
        }
      } catch {
        // ignore fallback errors
      }
    }

    return map;
  }
}
