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
import { WebhookService } from './webhook.service';
import { WebhookProducerService } from './webhook-producer.service';
import { ZodValidationPipe } from '../middleware/validation';
import {
  webhookValidation,
  PaystackWebhookPayload,
} from './dto/webhook.validation';
import { Public } from '../auth/decorators/auth.decorators';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly webhookProducerService: WebhookProducerService,
  ) {}

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(webhookValidation.paystack))
  async handlePaystackWebhook(
    @Body() payload: PaystackWebhookPayload,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
  ) {
    try {
      this.logger.log('Paystack webhook received', {
        event: payload.event,
        reference: payload.data?.reference,
        timestamp: new Date().toISOString(),
      });

      const signature = headers['x-paystack-signature'];
      if (!signature) {
        throw new UnauthorizedException('Missing webhook signature');
      }

      // Use raw body for signature verification (Paystack signs the exact raw body)
      const rawBody =
        (req as any).rawBody?.toString() || JSON.stringify(payload);

      const isValidSignature = await this.webhookService.verifySignature(
        rawBody,
        signature,
      );

      if (!isValidSignature) {
        this.logger.warn('Invalid webhook signature', {
          expectedSignature: signature,
          rawBodyLength: rawBody.length,
          payloadReference: payload.data?.reference,
        });
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Publish to RabbitMQ queue for async processing
      const published =
        await this.webhookProducerService.publishWebhookEvent(payload);

      if (!published) {
        this.logger.error('Failed to publish webhook to queue', {
          event: payload.event,
          reference: payload.data?.reference,
        });
        // Still return 200 to prevent Paystack retries
        // Will be handled by monitoring/alerts
      }

      return {
        status: 'success',
        message: 'Webhook received and queued for processing',
        reference: payload.data?.reference,
      };
    } catch (error) {
      // Differentiate between security errors and processing errors
      if (error instanceof UnauthorizedException) {
        // Security errors should fail - don't return 200
        throw error;
      }

      // Internal processing errors - log but return 200
      this.logger.error('Webhook processing failed (internal error)', {
        error: error.message,
        stack: error.stack,
        event: payload.event,
        reference: payload.data?.reference,
        timestamp: new Date().toISOString(),
      });

      // Return 200 to prevent Paystack from retrying
      // Internal errors will be handled by RabbitMQ retry logic later
      return {
        status: 'error',
        message: 'Internal processing error',
        reference: payload.data?.reference,
      };
    }
  }

  @Public()
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Body() payload: PaystackWebhookPayload) {
    this.logger.log('Test webhook received', payload);
    return { status: 'success', message: 'Test webhook received' };
  }
}
