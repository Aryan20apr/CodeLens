import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { SkillMetadata, SkillProvider } from './skill-provider.interface';
import { BUILT_IN_SKILLS_DIR } from './skills.constants';

export class FilesystemSkillProvider implements SkillProvider {
  constructor(
    private readonly builtInSkillsDir: string = BUILT_IN_SKILLS_DIR,
  ) {}

  async listSkills(): Promise<SkillMetadata[]> {
    const skillsMap = new Map<string, SkillMetadata>();

    // Discover built-in skills from builtInSkillsDir
    if (fs.existsSync(this.builtInSkillsDir)) {
      const entries = fs.readdirSync(this.builtInSkillsDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(
            this.builtInSkillsDir,
            entry.name,
            'SKILL.md',
          );
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, 'utf8');
            const meta = this.parseSkillFrontmatter(content, entry.name);
            if (meta) {
              skillsMap.set(meta.name, meta);
            }
          }
        }
      }
    }

    return Array.from(skillsMap.values());
  }

  async getSkillContent(name: string): Promise<string | null> {
    const skillFile = path.join(this.builtInSkillsDir, name, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      return fs.readFileSync(skillFile, 'utf8');
    }

    return null;
  }

  private parseSkillFrontmatter(
    content: string,
    fallbackName: string,
  ): SkillMetadata {
    try {
      const { data } = matter(content);
      const name =
        typeof data.name === 'string' && data.name.trim()
          ? data.name.trim()
          : fallbackName;
      const description =
        typeof data.description === 'string' && data.description.trim()
          ? data.description.trim()
          : `Review skill for ${fallbackName}`;

      return { name, description };
    } catch {
      return {
        name: fallbackName,
        description: `Review skill for ${fallbackName}`,
      };
    }
  }
}
