import { Module } from '@nestjs/common';
import { EmailQueueService } from '@/email/email-queue.service';
import { ResendService } from '@/email/resend.service';
import { TemplateService } from '@/email/template.service';

@Module({
  providers: [TemplateService, ResendService, EmailQueueService],
  exports: [EmailQueueService],
})
export class EmailModule {}
