import { FilesystemSkillProvider } from './filesystem-skill-provider';
import { BUILT_IN_SKILLS_DIR } from './skills.constants';

describe('FilesystemSkillProvider', () => {
  it('discovers built-in skills with names and descriptions', async () => {
    const provider = new FilesystemSkillProvider(BUILT_IN_SKILLS_DIR);
    const skills = await provider.listSkills();

    expect(skills.length).toBeGreaterThanOrEqual(4);
    const names = skills.map((s) => s.name);
    expect(names).toContain('security');
    expect(names).toContain('performance');
    expect(names).toContain('concurrency');
    expect(names).toContain('best-practices');

    const securitySkill = skills.find((s) => s.name === 'security');
    expect(securitySkill?.description).toContain('authentication');
  });

  it('retrieves full content of a built-in skill', async () => {
    const provider = new FilesystemSkillProvider(BUILT_IN_SKILLS_DIR);
    const content = await provider.getSkillContent('security');

    expect(content).not.toBeNull();
    expect(content).toContain('Security Audit Skill');
    expect(content).toContain('Authentication & Authorization');
  });

  it('returns null for nonexistent skill', async () => {
    const provider = new FilesystemSkillProvider(BUILT_IN_SKILLS_DIR);
    const content = await provider.getSkillContent('nonexistent-skill');

    expect(content).toBeNull();
  });

  it('parses complex frontmatter with colons, quotes, and multiline values', () => {
    const provider = new FilesystemSkillProvider(BUILT_IN_SKILLS_DIR);
    const content = `---
name: custom-audit
description: >-
  Audits for OWASP: SQLi, XSS,
  and CSRF vulnerabilities.
---
# Content`;

    const meta = (provider as any).parseSkillFrontmatter(content, 'fallback');
    expect(meta.name).toBe('custom-audit');
    expect(meta.description).toContain('Audits for OWASP: SQLi, XSS, and CSRF vulnerabilities.');
  });

  it('gracefully falls back when frontmatter is missing or invalid', () => {
    const provider = new FilesystemSkillProvider(BUILT_IN_SKILLS_DIR);
    const noFrontmatter = '# Just markdown';
    const invalidYaml = '---\n: bad: yaml: [unclosed\n---\n# Content';

    const meta1 = (provider as any).parseSkillFrontmatter(noFrontmatter, 'my-skill');
    expect(meta1.name).toBe('my-skill');
    expect(meta1.description).toBe('Review skill for my-skill');

    const meta2 = (provider as any).parseSkillFrontmatter(invalidYaml, 'my-skill');
    expect(meta2.name).toBe('my-skill');
    expect(meta2.description).toBe('Review skill for my-skill');
  });
});
