import * as path from 'path';
import * as fs from 'fs';
import { FilesystemSkillProvider } from './filesystem-skill-provider';
import { SkillOnlyBackend } from './skill-only-backend';

/**
 * Resolves the built-in platform skills directory across development (ts-node / ts-jest),
 * workspace source paths, and production build layouts (dist/src/review/skills).
 */
export function resolveBuiltInSkillsDir(): string {
  const beside = path.resolve(__dirname);
  if (fs.existsSync(path.join(beside, 'security', 'SKILL.md'))) {
    return beside;
  }

  const underDistSrc = path.resolve(
    process.cwd(),
    'dist',
    'src',
    'review',
    'skills',
  );
  if (fs.existsSync(path.join(underDistSrc, 'security', 'SKILL.md'))) {
    return underDistSrc;
  }

  const underSrc = path.resolve(process.cwd(), 'src', 'review', 'skills');
  if (fs.existsSync(path.join(underSrc, 'security', 'SKILL.md'))) {
    return underSrc;
  }

  const underDist = path.resolve(process.cwd(), 'dist', 'review', 'skills');
  if (fs.existsSync(path.join(underDist, 'security', 'SKILL.md'))) {
    return underDist;
  }

  return beside;
}

/**
 * Absolute path to built-in platform skills directory.
 */
export const BUILT_IN_SKILLS_DIR = resolveBuiltInSkillsDir();



/**
 * Creates a virtual read-only SkillOnlyBackend for platform skills.
 */
export function createSkillOnlyBackend(
  skillsDir: string = BUILT_IN_SKILLS_DIR,
): SkillOnlyBackend {
  const provider = new FilesystemSkillProvider(skillsDir);
  return new SkillOnlyBackend(provider);
}

/**
 * Backward-compatible alias for creating skill backend.
 */
export function createSkillsBackend(
  skillsDir: string = BUILT_IN_SKILLS_DIR,
): SkillOnlyBackend {
  return createSkillOnlyBackend(skillsDir);
}

/**
 * Safe, read-only host filesystem tools allowed for autonomous review agents.
 * Strictly limited to 'read_file' exclusively for virtual /skills/*.
 * Excludes glob, grep, ls, and all destructive mutation tools.
 */
export const SAFE_READONLY_FS_TOOLS = ['read_file'] as const;

/**
 * Tools that must be excluded when running review agents to guarantee host safety
 * and prevent hallucinated repository sweeps.
 */
export const EXCLUDED_HOST_TOOLS = [
  'ls',
  'glob',
  'grep',
  'write_file',
  'edit_file',
  'delete',
  'execute',
] as const;

