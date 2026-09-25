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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PromptDefinition<TVariables = any> {
  id: PromptId;
  version: string;
  description: string;
  tags: string[];
  render: (
    variables: TVariables,
    provider?: LlmProviderName,
  ) => {
    systemPrompt: string;
    userPrompt?: string;
  };
  providerOverrides?: Partial<
    Record<
      LlmProviderName,
      (variables: TVariables) => {
        systemPrompt: string;
        userPrompt?: string;
      }
    >
  >;
}
