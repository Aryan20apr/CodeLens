import type { AIMessage } from '@langchain/core/messages';

export function extractTextFromLlmContent(
  content: AIMessage['content'],
): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text);
        }
        return '';
      })
      .join('');
  }
  return String(content ?? '');
}
