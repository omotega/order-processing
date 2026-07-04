import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service';
import { ResendService } from './resend.service';
import { TemplateService } from './template.service';

@Module({
  providers: [TemplateService, ResendService, EmailQueueService],
  exports: [EmailQueueService],
})
export class EmailModule {}
