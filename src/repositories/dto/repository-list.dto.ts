import type { RepositoryDto } from './repository.dto';

export interface InstallationDto {
  installationId: string;
  accountLogin: string;
  accountType: string;
}

export interface RepositoryListDto {
  connected: boolean;
  installationCount: number;
  installations: InstallationDto[];
  repositories: RepositoryDto[];
}
