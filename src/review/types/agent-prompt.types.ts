export type AgentRole = 'security' | 'performance' | 'best_practices';

export const AGENT_ROLES: AgentRole[] = [
    'security',
    'performance',
    'best_practices',
  ];

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
    security: 'Security',
    performance: 'Performance',
    best_practices: 'Best Practices',
  };