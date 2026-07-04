import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/guards/roles.guard';

@Controller('webhook')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhookMonitoringController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('status/:reference')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getWebhookStatus(@Param('reference') reference: string) {
    return this.webhookService.getWebhookStatus(reference);
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'webhook-service',
    };
  }
}
