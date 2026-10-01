import { Injectable } from '@nestjs/common';
import { errorSummary } from '@/common/errors/classified.error';
import {
  InboxRepository,
  type ClaimedInbox,
} from '@database/repository/inbox.repository';
import {
  INBOX_MAX_ATTEMPTS,
  INBOX_RETRY_BASE_DELAY_MS,
} from '@/kafka/kafka.constants';
import { isRetryableError } from '@/kafka/retry-with-jitter';

export type InboxRunOutcome =
  'COMPLETED' | 'RETRY_SCHEDULED' | 'DEAD_LETTERED' | 'CLAIM_LOST';

@Injectable()
export class InboxProcessor {
  constructor(private readonly inboxRepository: InboxRepository) {}

  async run(
    claim: ClaimedInbox,
    work: () => Promise<void>,
    onDeadLetter?: (error: unknown) => Promise<void>,
  ): Promise<InboxRunOutcome> {
    if (claim.message.retryCount >= INBOX_MAX_ATTEMPTS) {
      return this.deadLetter(claim, 'Retry budget exhausted', onDeadLetter);
    }

    try {
      await work();
    } catch (error) {
      const exhausted = claim.message.retryCount + 1 >= INBOX_MAX_ATTEMPTS;
      if (!isRetryableError(error) || exhausted) {
        return this.deadLetter(claim, error, onDeadLetter);
      }
      const recorded = await this.inboxRepository.markFailed(
        claim,
        errorSummary(error),
        nextInboxAttemptAt(claim.message.retryCount),
      );
      return recorded ? 'RETRY_SCHEDULED' : 'CLAIM_LOST';
    }

    const recorded = await this.inboxRepository.markCompleted(claim);
    return recorded ? 'COMPLETED' : 'CLAIM_LOST';
  }

  private async deadLetter(
    claim: ClaimedInbox,
    error: unknown,
    onDeadLetter?: (error: unknown) => Promise<void>,
  ): Promise<InboxRunOutcome> {
    const recorded = await this.inboxRepository.markDlq(
      claim,
      errorSummary(error),
    );
    if (!recorded) {
      return 'CLAIM_LOST';
    }
    await onDeadLetter?.(error);
    return 'DEAD_LETTERED';
  }
}

function nextInboxAttemptAt(retryCount: number): Date {
  return new Date(Date.now() + INBOX_RETRY_BASE_DELAY_MS * 2 ** retryCount);
}
