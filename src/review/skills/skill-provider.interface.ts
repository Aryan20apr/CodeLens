export interface SkillMetadata {
  name: string;
  description: string;
}

export interface SkillProvider {
  listSkills(): Promise<SkillMetadata[]>;
  getSkillContent(name: string): Promise<string | null>;
}
