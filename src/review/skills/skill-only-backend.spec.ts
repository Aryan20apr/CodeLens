import { SkillOnlyBackend } from './skill-only-backend';
import type { SkillProvider, SkillMetadata } from './skill-provider.interface';

describe('SkillOnlyBackend', () => {
  let mockProvider: jest.Mocked<SkillProvider>;
  let backend: SkillOnlyBackend;

  const sampleSkills: SkillMetadata[] = [
    { name: 'security', description: 'Security audit skill' },
    { name: 'performance', description: 'Performance audit skill' },
  ];

  const sampleSkillContent = `---
name: security
description: Security audit skill
---
# Security Guidelines
Follow zero trust principles.`;

  beforeEach(() => {
    mockProvider = {
      listSkills: jest.fn().mockResolvedValue(sampleSkills),
      getSkillContent: jest.fn().mockImplementation(async (name: string) => {
        if (name === 'security') return sampleSkillContent;
        if (name === 'performance') return '# Performance Guidelines';
        return null;
      }),
    };

    backend = new SkillOnlyBackend(mockProvider);
  });

  describe('ls', () => {
    it('discovers skills directories under /skills/ and /skills', async () => {
      const resWithTrailing = await backend.ls('/skills/');
      expect(resWithTrailing).toEqual({
        files: [
          { path: '/skills/security/', is_dir: true },
          { path: '/skills/performance/', is_dir: true },
        ],
      });

      const resWithoutTrailing = await backend.ls('/skills');
      expect(resWithoutTrailing).toEqual({
        files: [
          { path: '/skills/security/', is_dir: true },
          { path: '/skills/performance/', is_dir: true },
        ],
      });
    });

    it('returns empty files array for non-skills paths', async () => {
      const res = await backend.ls('/src/main/java');
      expect(res).toEqual({ files: [] });
    });
  });

  describe('read', () => {
    it('reads virtual /skills/{name}/SKILL.md correctly', async () => {
      const res = await backend.read('/skills/security/SKILL.md');
      expect(res.content).toBe(sampleSkillContent);
      expect(mockProvider.getSkillContent).toHaveBeenCalledWith('security');
    });

    it('returns error when skill does not exist', async () => {
      const res = await backend.read('/skills/unknown/SKILL.md');
      expect(res).toHaveProperty('error');
      expect((res as any).error).toContain('Skill "unknown" not found');
    });

    it('rejects repository paths and reminds caller to use get_file_content_at_sha', async () => {
      const repoPaths = [
        'src/main/java/com/example/UserService.java',
        '/src/main/java/com/example/UserService.java',
        'auth.service.ts',
        '/repo/README.md',
      ];

      for (const p of repoPaths) {
        const res = await backend.read(p);
        expect(res).toHaveProperty('error');
        expect((res as any).error).toContain('get_file_content_at_sha');
      }
    });

    it('rejects path traversal attempts', async () => {
      const traversalPaths = [
        '/skills/../etc/passwd',
        '/skills/../../secret',
        '/skills/security/../../../app.ts',
      ];

      for (const p of traversalPaths) {
        const res = await backend.read(p);
        expect(res).toHaveProperty('error');
      }
    });
  });

  describe('readRaw', () => {
    it('returns raw FileData for valid skills', async () => {
      const res = await backend.readRaw('/skills/security/SKILL.md');
      expect(res.error).toBeUndefined();
      expect(res.data).toBeDefined();
      expect(res.data?.content).toBe(sampleSkillContent);
      expect((res.data as any)?.mimeType).toBe('text/markdown');
    });

    it('returns error for invalid paths', async () => {
      const res = await backend.readRaw('src/main/App.java');
      expect(res.error).toBeDefined();
      expect(res.data).toBeUndefined();
    });
  });

  describe('downloadFiles', () => {
    it('downloads requested SKILL.md files into Buffer objects', async () => {
      const res = await backend.downloadFiles([
        '/skills/security/SKILL.md',
        '/skills/performance/SKILL.md',
      ]);

      expect(res).toHaveLength(2);
      expect(res[0].path).toBe('/skills/security/SKILL.md');
      expect(res[0].content).toEqual(Buffer.from(sampleSkillContent, 'utf8'));
      expect(res[1].path).toBe('/skills/performance/SKILL.md');
      expect(res[1].content).toEqual(
        Buffer.from('# Performance Guidelines', 'utf8'),
      );
    });

    it('returns error objects for invalid or missing files', async () => {
      const res = await backend.downloadFiles([
        '/skills/unknown/SKILL.md',
        'src/App.java',
      ]);

      expect(res).toHaveLength(2);
      expect(res[0].error).toBeDefined();
      expect(res[1].error).toBeDefined();
    });
  });

  describe('glob & grep', () => {
    it('returns empty results safely without failing', async () => {
      const globRes = await backend.glob('**/*.md');
      expect(globRes).toEqual({ files: [] });

      const grepRes = await backend.grep('password');
      expect(grepRes).toEqual({ matches: [] });
    });
  });

  describe('mutations', () => {
    it('denies write, edit, and delete operations', async () => {
      const writeRes = await backend.write('/skills/test/SKILL.md', 'foo');
      expect(writeRes.error).toMatch(/read-only/i);

      const editRes = await backend.edit('/skills/test/SKILL.md', 'foo', 'bar');
      expect(editRes.error).toMatch(/read-only/i);

      if (backend.delete) {
        const delRes = await backend.delete('/skills/test/SKILL.md');
        expect(delRes.error).toMatch(/read-only/i);
      }
    });
  });
});
