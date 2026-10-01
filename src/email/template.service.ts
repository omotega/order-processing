import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import mjml2html = require('mjml');
import type { EmailTemplateName } from '@/email/types/email-job.types';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');

  async render(
    templateName: EmailTemplateName,
    variables: Record<string, string>,
  ) {
    const templatePath = path.join(this.templatesDir, `${templateName}.mjml`);

    if (!fs.existsSync(templatePath)) {
      this.logger.error(`Email template not found: ${templatePath}`);
      throw new Error(`Email template not found: ${templateName}`);
    }

    let mjmlSource = fs.readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(variables)) {
      mjmlSource = mjmlSource.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    const { html, errors } = await mjml2html(mjmlSource, {
      validationLevel: 'soft',
    });

    if (errors?.length) {
      this.logger.warn(
        `MJML warnings for ${templateName}: ${errors.map((e) => e.message).join(', ')}`,
      );
    }

    return { html };
  }
}
