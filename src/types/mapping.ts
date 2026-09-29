export type MatchType = 'domain' | 'url_prefix' | 'url_regex' | 'title_contains' | 'meta_tag';

export type TicketType = 'Bug' | 'Improvement' | 'Task';

export interface MappingRule {
  id: string;
  name: string;
  matchType: MatchType;
  pattern: string; // hostname, prefix, regex, or title query
  metaKey?: string; // e.g. "application-name", "project", "og:site_name"
  metaValue?: string; // value to match against
  teamId: string;
  projectId?: string;
  labelId?: string;
  labelName?: string;
  labels?: string[]; // e.g. ['Engineering', 'repo:app']
  allowedLabels?: string[]; // subset of labels relevant to this project for selection
  defaultType?: TicketType;
  defaultPriority?: number;
  createdAt: number;
}

export interface PageMetadata {
  url: string;
  origin: string;
  hostname: string;
  pathname: string;
  title: string;
  pageTitle?: string;
  rawTitle?: string;
  heading?: string;
  metaTags: Record<string, string>;
  viewport: {
    width: number;
    height: number;
  };
  userAgent: string;
}

export interface MatchResult {
  matched: boolean;
  rule?: MappingRule;
  matchReason?: string;
  source: 'explicit_rule' | 'domain_cache' | 'none';
}
