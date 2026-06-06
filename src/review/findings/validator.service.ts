import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';

import type { AppConfig } from '../../config/app-config.types';
import { APP_CONFIG } from '../../config/config.constants';
import type { Finding, FindingSeverity } from '../../graph/state.types';
import { buildAddedLineIndex } from './added-line-index.util';
import type {
  FindingDropReason,
  ValidatePrFindingsInput,
  ValidatePrFindingsResult,
  ValidationStats,
} from '../types/pr-findings.types';

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const CONFIDENCE_RANK: Record<Finding['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function meetsMinConfidence(
  confidence: Finding['confidence'],
  min: 'low' | 'medium' | 'high',
): boolean {
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[min];
}

function sortFindingsForCap(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  });
}

@Injectable()
export class ValidatePrFindingsService {
  private readonly logger: Logger;
  private readonly findingsConfig: AppConfig['prReview']['findings'];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.logger = logger.child({ context: ValidatePrFindingsService.name });
    this.findingsConfig = config.prReview.findings;
  }

  validate(input: ValidatePrFindingsInput): ValidatePrFindingsResult {
    const className = ValidatePrFindingsService.name;
    const methodName = 'validate';

    const hintedPaths = input.crossFileHints.flatMap((h) => h.paths);
    const index = buildAddedLineIndex(
      input.chunks,
      input.fileIndex,
      hintedPaths,
    );

    const dropReasons: Partial<Record<FindingDropReason, number>> = {};
    const recordDrop = (reason: FindingDropReason) => {
      dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
    };

    const cfg = input.config;
    const passed: Finding[] = [];

    for (const finding of input.rawFindings) {
      const filePath = finding.filePath?.trim();
      if (!filePath) {
        recordDrop('missing_file_path');
        continue;
      }

      if (finding.location.endLine < finding.location.startLine) {
        recordDrop('invalid_line_range');
        continue;
      }

      const isInDiff = index.diffFilePaths.has(filePath);
      const isHinted = index.hintedFilePaths.has(filePath);

      if (!isInDiff && !isHinted) {
        recordDrop('cross_file_unsupported');
        continue;
      }

      if (isInDiff) {
        const lines = index.linesByFile.get(filePath);
        const startOk = lines?.has(finding.location.startLine) ?? false;
        const endOk =
          finding.location.endLine === finding.location.startLine ||
          (lines?.has(finding.location.endLine) ?? false);
        if (!startOk || !endOk) {
          recordDrop('line_not_in_diff');
          continue;
        }
      }

      if (!meetsMinConfidence(finding.confidence, cfg.minConfidence)) {
        recordDrop('low_confidence');
        continue;
      }

      if (!cfg.allowedSeverities.includes(finding.severity)) {
        recordDrop('severity_filtered');
        continue;
      }

      passed.push(finding);
    }

    const sorted = sortFindingsForCap(passed);

    const perFileCount = new Map<string, number>();
    const afterPerFile: Finding[] = [];
    for (const f of sorted) {
      const path = f.filePath!;
      const count = perFileCount.get(path) ?? 0;
      if (count >= cfg.maxPerFile) {
        recordDrop('per_file_cap');
        continue;
      }
      perFileCount.set(path, count + 1);
      afterPerFile.push(f);
    }

    const validatedFindings = afterPerFile.slice(0, cfg.maxInlineComments);
    if (afterPerFile.length > cfg.maxInlineComments) {
      const dropped = afterPerFile.length - cfg.maxInlineComments;
      dropReasons.global_cap = (dropReasons.global_cap ?? 0) + dropped;
    }

    const stats: ValidationStats = {
      rawCount: input.rawFindings.length,
      validCount: validatedFindings.length,
      droppedCount: input.rawFindings.length - validatedFindings.length,
      dropReasons,
    };

    this.logger.info(`[${className}] [${methodName}] :: Findings validated`, {
      rawCount: stats.rawCount,
      validCount: stats.validCount,
      droppedCount: stats.droppedCount,
      dropReasons: stats.dropReasons,
    });

    return { validatedFindings, validationStats: stats };
  }

  getDefaultConfig(): ValidatePrFindingsInput['config'] {
    return {
      maxInlineComments: this.findingsConfig.maxInlineComments,
      maxPerFile: this.findingsConfig.maxPerFile,
      minConfidence: this.findingsConfig.minConfidence,
      allowedSeverities: this.findingsConfig.allowedSeverities,
    };
  }
}
