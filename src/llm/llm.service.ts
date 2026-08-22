import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import type { AppConfig } from '../config/app-config.types';
import { APP_CONFIG } from '../config/config.constants';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGroq } from '@langchain/groq';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { UserLlmKey } from '../llm-provider/llm-provider.service';

@Injectable()
export class LlmService {
    private readonly logger: Logger;
    private readonly config: AppConfig['llm'];

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
        @Inject(APP_CONFIG) config: AppConfig,
    ) {
        this.logger = logger.child({ context: LlmService.name });
        this.config = config.llm;
    }

    getChatModel(userKey?: UserLlmKey): BaseChatModel {
        if (userKey) {
            this.logger.debug(`[LlmService] [getChatModel] :: using user-provided key for ${userKey.provider}`, {
                model: userKey.model,
            });

            switch (userKey.provider) {
                case 'GEMINI':
                    return new ChatGoogleGenerativeAI({
                        apiKey: userKey.rawKey,
                        model: userKey.model || this.config.geminiModel,
                    });
                case 'OPENAI':
                    return new ChatOpenAI({
                        apiKey: userKey.rawKey,
                        model: userKey.model || 'gpt-4o',
                    });
                case 'GROQ':
                    return new ChatGroq({
                        apiKey: userKey.rawKey,
                        model: userKey.model || 'llama3-70b-8192',
                    });
                case 'NVIDIA':
                    return new ChatOpenAI({
                        apiKey: userKey.rawKey,
                        model: userKey.model || this.config.nvidiaModel,
                        configuration: userKey.nvidiaBaseUrl ? { baseURL: userKey.nvidiaBaseUrl } : undefined,
                    });
            }
        }

        const provider = this.config.provider;

        if (provider === 'nvidia') {
            if (!this.config.nvidiaApiKey) {
                throw new Error('NVIDIA_API_KEY is not set');
            }
            this.logger.debug(`[LlmService] [getChatModel] :: using Nvidia NIM`, {
                model: this.config.nvidiaModel,
            });
            return new ChatOpenAI({
                apiKey: this.config.nvidiaApiKey,
                model: this.config.nvidiaModel,
                configuration: {
                    baseURL: this.config.nvidiaBaseUrl,
                },
            });
        }

        // gemini
        const apiKey = this.config.googleGenerativeAiApiKey || this.config.googleApiKeyFallback;
        if (!apiKey || !this.config.geminiModel) {
            throw new Error('GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_MODEL is not set');
        }
        this.logger.debug(`[LlmService] [getChatModel] :: using Gemini`, {
            model: this.config.geminiModel,
        });
        return new ChatGoogleGenerativeAI({
            apiKey,
            model: this.config.geminiModel,
        });
    }
}
