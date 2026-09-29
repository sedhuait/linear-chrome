export interface LinearViewer {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
  icon?: string;
  color?: string;
  teamIds: string[];
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  color?: string;
  labels: LinearLabel[];
  projects: LinearProject[];
}

export interface LinearWorkspaceData {
  viewer: LinearViewer;
  teams: LinearTeam[];
  projects: LinearProject[];
}

export interface IssueCreateInput {
  teamId: string;
  title: string;
  description?: string;
  projectId?: string;
  priority?: number; // 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  labelIds?: string[];
}

export interface CreatedIssue {
  id: string;
  identifier: string; // e.g. ENG-123
  title: string;
  url: string;
}

export interface FileUploadPayload {
  uploadUrl: string;
  assetUrl: string;
  headers: { key: string; value: string }[];
}
