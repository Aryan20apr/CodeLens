import * as path from 'path';
import * as fs from 'fs';
import { FilesystemBackend } from 'deepagents';
import {
  BUILT_IN_SKILLS_DIR,
  createSkillsBackend,
  resolveBuiltInSkillsDir,
  SAFE_READONLY_FS_TOOLS,
  EXCLUDED_HOST_TOOLS,
} from './skills.constants';

describe('Skill Bank & FilesystemBackend (agentskills.io)', () => {
  const skills = ['security', 'performance', 'concurrency', 'best-practices'];

  it('contains all required platform skills with valid YAML frontmatter', () => {
    for (const skill of skills) {
      const skillFile = path.join(BUILT_IN_SKILLS_DIR, skill, 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);

      const content = fs.readFileSync(skillFile, 'utf8');
      expect(content).toMatch(
        /^---\s*\nname:\s*[\w-]+\s*\ndescription:\s*.+\s*\n---/,
      );
    }
  });

  it('creates a sandboxed FilesystemBackend that reads skill files via virtual root', async () => {
    const backend = createSkillsBackend();
    expect(backend).toBeInstanceOf(FilesystemBackend);

    const securitySkill = await backend.read('/security/SKILL.md');
    expect(securitySkill).toBeDefined();
    expect(securitySkill.content).toContain('name: security');
  });

  it('defines safety excluded tools to prevent host filesystem mutations', () => {
    expect(EXCLUDED_HOST_TOOLS).toContain('write_file');
    expect(EXCLUDED_HOST_TOOLS).toContain('edit_file');
    expect(EXCLUDED_HOST_TOOLS).toContain('delete');
    expect(EXCLUDED_HOST_TOOLS).toContain('execute');
  });

  it('defines safe read-only filesystem tools without mutation tools', () => {
    expect(SAFE_READONLY_FS_TOOLS).toEqual([
      'ls',
      'read_file',
      'glob',
      'grep',
    ]);
    expect(SAFE_READONLY_FS_TOOLS).not.toContain('write_file');
    expect(SAFE_READONLY_FS_TOOLS).not.toContain('edit_file');
    expect(SAFE_READONLY_FS_TOOLS).not.toContain('delete');
    expect(SAFE_READONLY_FS_TOOLS).not.toContain('execute');
  });

  it('resolves built-in skills directory containing security skill', () => {
    const resolved = resolveBuiltInSkillsDir();
    expect(fs.existsSync(path.join(resolved, 'security', 'SKILL.md'))).toBe(true);
  });

  it('extracts skill frontmatter metadata without leaking full body into system prompt', async () => {
    const { createSkillsMiddleware } = await import('deepagents');
    const backend = createSkillsBackend();
    const middleware = createSkillsMiddleware({
      backend,
      sources: ['/'],
    });

    const state = await (middleware as any).beforeModel({});
    expect(state.skillsMetadata).toBeDefined();
    expect(state.skillsMetadata.length).toBe(4);

    const sec = state.skillsMetadata.find((s: any) => s.name === 'security');
    expect(sec).toBeDefined();
    expect(sec.description).toContain('authentication');
    // Verify that the full markdown instruction body is NOT in metadata (preventing context bloat)
    expect((sec as any).content).toBeUndefined();
  });

  it('layers repository-level skills on top of built-in skills via composite backend or multi-source', async () => {
    const os = await import('os');
    const { createSkillsMiddleware, CompositeBackend, FilesystemBackend } =
      await import('deepagents');
    const builtInBackend = createSkillsBackend();

    // Create a temporary repo skills folder to simulate fetched repo skills
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'codelens-repo-skills-'),
    );
    const customSkillDir = path.join(tempDir, 'custom-rule');
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(customSkillDir, 'SKILL.md'),
      `---
name: custom-rule
description: Custom repository domain rule for payment idempotency.
---
# Custom Rule
Always check idempotency key.`,
    );

    const repoBackend = new FilesystemBackend({
      rootDir: tempDir,
      virtualMode: true,
    });

    const compositeBackend = new CompositeBackend(builtInBackend, {
      '/repo-skills/': repoBackend,
    });

    try {
      const middleware = createSkillsMiddleware({
        backend: compositeBackend,
        sources: ['/', '/repo-skills/'],
      });

      const state = await (middleware as any).beforeModel({});
      const skillNames = state.skillsMetadata.map((s: any) => s.name);
      expect(skillNames).toContain('security');
      expect(skillNames).toContain('performance');
      expect(skillNames).toContain('custom-rule');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
