import type { PrReviewStep } from '../../../streaming/types/pr-review-progress.types';

export class TerminalReviewError extends Error {

    constructor(
        message: string,
        readonly step: PrReviewStep
    ){
        super(message);
        this.name = 'TerminalReviewError';
    }
}