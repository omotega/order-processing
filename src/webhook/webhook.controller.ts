import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  UsePipes,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from '@/webhook/webhook.service';
import { ZodValidationPipe } from '@/middleware/validation';
import {
  webhookValidation,
  PaystackWebhookPayload,
} from '@/webhook/dto/webhook.validation';
import { Public } from '@/auth/decorators/auth.decorators';
import { WEBHOOK_ERRORS } from '@/common/errors/index';
import {
  WEBHOOK_LOG_EVENTS,
  WebhookResponseStatus,
} from '@/webhook/webhook.constants';
import { WebhookProvider } from '@/utils/database.enums';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(webhookValidation.paystack))
  async handlePaystackWebhook(
    @Body() payload: PaystackWebhookPayload,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
  ) {
    const signature = headers['x-paystack-signature'];
    if (!signature) {
      throw new UnauthorizedException(WEBHOOK_ERRORS.MISSING_SIGNATURE);
    }

    const rawBody =
      (req as { rawBody?: Buffer }).rawBody?.toString() ||
      JSON.stringify(payload);

    const isValidSignature = await this.webhookService.verifySignature(
      rawBody,
      signature,
    );

    if (!isValidSignature) {
      this.logger.warn('Invalid webhook signature', {
        event: WEBHOOK_LOG_EVENTS.APPLY_FAILED,
        webhookRequestCorrelationId: req.correlationId,
        reference: payload.data?.reference,
        webhookEventType: payload.event,
        provider: WebhookProvider.PAYSTACK,
        rawBodyLength: rawBody.length,
      });
      throw new UnauthorizedException(WEBHOOK_ERRORS.INVALID_SIGNATURE);
    }

    const result = await this.webhookService.acceptPaystackWebhook(
      payload,
      signature,
      rawBody,
      req.correlationId,
    );

    this.logger.log('Provider webhook acknowledged', {
      event: WEBHOOK_LOG_EVENTS.ACKNOWLEDGED,
      webhookRequestCorrelationId: req.correlationId,
      correlationId: result.logContext.correlationId,
      reference: payload.data?.reference,
      webhookEventType: payload.event,
      webhookEventId: result.logContext.webhookEventId,
      paymentId: result.logContext.paymentId,
      provider: WebhookProvider.PAYSTACK,
      outcome: result.logContext.outcome,
      httpStatus: HttpStatus.OK,
    });

    return result.response;
  }

  @Public()
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Body() payload: PaystackWebhookPayload) {
    this.logger.log('Test webhook received', {
      event: WEBHOOK_LOG_EVENTS.ACKNOWLEDGED,
      webhookEventType: payload.event,
      reference: payload.data?.reference,
      outcome: WebhookResponseStatus.SUCCESS,
    });
    return {
      status: WebhookResponseStatus.SUCCESS,
      message: 'Test webhook received',
    };
  }
}
