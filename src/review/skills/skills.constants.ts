import * as path from 'path';
import * as fs from 'fs';
import { FilesystemBackend } from 'deepagents';

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
 * Creates a sandboxed read-only FilesystemBackend for built-in platform skills.
 */
export function createSkillsBackend(
  skillsDir: string = BUILT_IN_SKILLS_DIR,
): FilesystemBackend {
  return new FilesystemBackend({
    rootDir: skillsDir,
    virtualMode: true,
  });
}

/**
 * Safe, read-only host filesystem tools allowed for autonomous review agents.
 * Excludes destructive mutation tools (write_file, edit_file, delete, execute).
 */
export const SAFE_READONLY_FS_TOOLS = [
  'ls',
  'read_file',
  'glob',
  'grep',
] as const;

/**
 * Tools that must be excluded when running review agents to guarantee host safety.
 */
export const EXCLUDED_HOST_TOOLS = [
  'write_file',
  'edit_file',
  'delete',
  'execute',
] as const;
