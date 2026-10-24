import type { PromptDefinition } from '../types/prompt.types';
import { prTriagePrompt } from './pr/pr-triage.prompt';
import { prSpecializedPrompt } from './pr/pr-specialized.prompt';
import { prSinglePrompt } from './pr/pr-single.prompt';
import { prSynthesizePrompt } from './pr/pr-synthesize.prompt';
import { prLeadAgentPrompt } from './pr/pr-lead-agent.prompt';
import { prInvestigatorPrompt } from './pr/pr-investigator.prompt';
import { prVerifierPrompt } from './pr/pr-verifier.prompt';
import { snippetAnalysisPrompt } from './snippet/snippet-analysis.prompt';
import { snippetRefinePrompt } from './snippet/snippet-refine.prompt';

export const PROMPT_CATALOG: PromptDefinition[] = [
  prTriagePrompt,
  prSpecializedPrompt,
  prSinglePrompt,
  prSynthesizePrompt,
  prLeadAgentPrompt,
  prInvestigatorPrompt,
  prVerifierPrompt,
  snippetAnalysisPrompt,
  snippetRefinePrompt,
];

export {
  prTriagePrompt,
  prSpecializedPrompt,
  prSinglePrompt,
  prSynthesizePrompt,
  prLeadAgentPrompt,
  prInvestigatorPrompt,
  prVerifierPrompt,
  snippetAnalysisPrompt,
  snippetRefinePrompt,
};
