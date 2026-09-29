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
