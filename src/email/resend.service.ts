import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '@/config/config';

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    this.apiKey = appConfig.email.apiKey;
    this.from = appConfig.email.from;
  }

  async send({
    to,
    subject,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
  }) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.sendOnce({ to, subject, html });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_ATTEMPTS) {
          const delayMs = attempt * 1000;
          this.logger.warn(
            `Resend attempt ${attempt}/${MAX_ATTEMPTS} failed for ${to}: ${lastError.message}. Retrying in ${delayMs}ms.`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error(
      `Failed to send email to ${to} after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`,
    );
    throw lastError ?? new Error('Failed to send email');
  }

  private async sendOnce({
    to,
    subject,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
  }) {
    let response: Response;

    try {
      response = await fetch(appConfig.resendService.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          html,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Network request failed';
      throw new Error(`Resend request failed: ${message}`);
    }

    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      throw new Error(body.message ?? `Resend API error (${response.status})`);
    }
  }
}
