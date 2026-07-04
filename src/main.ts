import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './filters/http.exception.filter';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.setGlobalPrefix('api/v1');

  await app.listen(3200);
}
bootstrap();
