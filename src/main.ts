import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { HttpErrorFilter } from '@/filters/http.exception.filter';
import { FileLogger } from '@/common/file.logger';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const logger = new FileLogger();
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger,
  });
  app.useLogger(logger);
  app.useGlobalFilters(new HttpErrorFilter());
  app.setGlobalPrefix('api/v1');

  await app.listen(3300);
}
bootstrap();
