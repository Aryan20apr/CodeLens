export type PromptId =
  | 'pr-review.triage'
  | 'pr-review.specialized'
  | 'pr-review.single'
  | 'pr-review.synthesize'
  | 'snippet.analysis'
  | 'snippet.refine';

export type LlmProviderName = 'GEMINI' | 'OPENAI' | 'GROQ' | 'NVIDIA';

export interface PromptMetadata {
  id: PromptId;
  version: string;
  description: string;
  tags: string[];
}

export interface RenderedPrompt {
  systemPrompt: string;
  userPrompt?: string;
  metadata: PromptMetadata;
  langchainMetadata: {
    tags: string[];
    metadata: {
      promptId: PromptId;
      promptVersion: string;
      provider?: LlmProviderName;
    };
  };
}

export interface PromptDefinition<T = any> {
  id: PromptId;
  version: string;
  description: string;
  tags: string[];
  render: (
    variables: T,
    provider?: LlmProviderName,
  ) => {
    systemPrompt: string;
    userPrompt?: string;
  };
  providerOverrides?: Partial<
    Record<
      LlmProviderName,
      (variables: T) => {
        systemPrompt: string;
        userPrompt?: string;
      }
    >
  >;
}
