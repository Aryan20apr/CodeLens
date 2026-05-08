import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { AppConfigModule } from '../config/config.module';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';

@Injectable()
export class LlmService {
    private readonly logger: Logger;
    private readonly googleGenerativeAiApiKey: string;
    private readonly googleApiKeyFallback: string;
    private readonly geminiModel: string;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
        @Inject(APP_CONFIG) config: AppConfig,
    ) {
        this.logger = logger.child({ context: LlmService.name });
        this.googleGenerativeAiApiKey = config.llm.googleGenerativeAiApiKey;
        this.googleApiKeyFallback = config.llm.googleApiKeyFallback;
        this.geminiModel = config.llm.geminiModel;
    }

    getChatModel(): ChatGoogleGenerativeAI {
        
        const apiKey = this.googleGenerativeAiApiKey || this.googleApiKeyFallback;
        if(!apiKey || !this.geminiModel) {
            throw new Error('Google Generative AI API key or Gemini model is not set');
        }
        return new ChatGoogleGenerativeAI({
            apiKey,
            model: this.geminiModel,
        });
    }
    
}
