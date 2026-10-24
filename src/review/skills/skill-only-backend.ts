import type {
  BackendProtocolV2,
  DeleteResult,
  EditResult,
  FileDownloadResponse,
  GlobResult,
  GrepResult,
  LsResult,
  ReadRawResult,
  ReadResult,
  WriteResult,
} from 'deepagents';
import type { SkillProvider } from './skill-provider.interface';

export class SkillOnlyBackend implements BackendProtocolV2 {
  constructor(private readonly skillProvider: SkillProvider) {}

  /**
   * Discovers skill directories under /skills/
   */
  async ls(path: string): Promise<LsResult> {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
    if (
      normalized === '/skills' ||
      normalized === 'skills' ||
      normalized === '' ||
      normalized === '/'
    ) {
      const skills = await this.skillProvider.listSkills();
      return {
        files: skills.map((s) => ({
          path: `/skills/${s.name}/`,
          is_dir: true,
        })),
      };
    }
    return { files: [] };
  }

  /**
   * Reads a virtual skill file: /skills/{skillName}/SKILL.md
   */
  async read(
    filePath: string,
    offset?: number,
    limit?: number,
  ): Promise<ReadResult> {
    const normalized = filePath.replace(/\\/g, '/');
    const match =
      normalized.match(/^\/?skills\/([^/]+)\/SKILL\.md$/i) ||
      normalized.match(/^\/?([^/]+)\/SKILL\.md$/i);

    if (!match) {
      return {
        error: `Invalid skill path "${filePath}". read_file is EXCLUSIVELY for /skills/{skillName}/SKILL.md. To inspect repository source code, use get_file_content_at_sha.`,
      };
    }

    const skillName = match[1];
    const fullContent = await this.skillProvider.getSkillContent(skillName);

    if (fullContent === null || fullContent === undefined) {
      return { error: `Skill "${skillName}" not found.` };
    }

    if (offset !== undefined || limit !== undefined) {
      const lines = fullContent.split('\n');
      const start = Math.max(0, (offset ?? 1) - 1);
      const end = limit !== undefined ? start + limit : lines.length;
      return {
        content: lines.slice(start, end).join('\n'),
        mimeType: 'text/markdown',
        totalLines: lines.length,
        startLine: start + 1,
        endLine: Math.min(end, lines.length),
      };
    }

    return { content: fullContent, mimeType: 'text/markdown' };
  }

  /**
   * Reads raw file data for virtual skill files
   */
  async readRaw(filePath: string): Promise<ReadRawResult> {
    const res = await this.read(filePath);
    if (res.error) {
      return { error: res.error };
    }
    const content = typeof res.content === 'string' ? res.content : '';
    const now = new Date().toISOString();
    return {
      data: {
        content,
        mimeType: 'text/markdown',
        created_at: now,
        modified_at: now,
      },
    };
  }

  /**
   * Download batch for deepagents SkillsMiddleware discovery
   */
  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = [];

    for (const p of paths) {
      const readRes = await this.read(p);
      if (readRes.error) {
        results.push({ path: p, content: null, error: 'file_not_found' });
      } else if (typeof readRes.content === 'string') {
        results.push({
          path: p,
          content: Buffer.from(readRes.content, 'utf8'),
          error: null,
        });
      } else {
        results.push({ path: p, content: null, error: 'file_not_found' });
      }
    }

    return results;
  }

  /**
   * Safe no-op for glob
   */
  async glob(_pattern: string, _path?: string): Promise<GlobResult> {
    return { files: [] };
  }

  /**
   * Safe no-op for grep
   */
  async grep(
    _pattern: string,
    _path?: string | null,
    _glob?: string | null,
    _maxCount?: number | null,
  ): Promise<GrepResult> {
    return { matches: [] };
  }

  /**
   * Mutation guards: Skills are read-only at runtime
   */
  async write(_filePath: string, _content: string): Promise<WriteResult> {
    return {
      error:
        'Skill backend is read-only. Mutation operations are not supported.',
    };
  }

  async edit(
    _filePath: string,
    _oldString: string,
    _newString: string,
    _replaceAll?: boolean,
  ): Promise<EditResult> {
    return {
      error:
        'Skill backend is read-only. Mutation operations are not supported.',
    };
  }

  async delete(_filePath: string): Promise<DeleteResult> {
    return {
      error:
        'Skill backend is read-only. Mutation operations are not supported.',
    };
  }
}
