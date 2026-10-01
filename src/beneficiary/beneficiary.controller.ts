import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { BeneficiaryService } from '@/beneficiary/beneficiary.service';
import beneficiaryValidation, {
  CreateBeneficiaryDto,
} from '@/beneficiary/dto/beneficiary.validation';
import { ZodValidationPipe } from '@/middleware/validation';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import { UserRole } from '@/auth/guards/roles.guard';

@Controller('beneficiaries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.beneficiaryService.list(user.id);
  }

  @Post()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(beneficiaryValidation.create))
  create(
    @Body() body: CreateBeneficiaryDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.beneficiaryService.create(user.id, body);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.beneficiaryService.getById(user.id, id);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.beneficiaryService.remove(user.id, id);
  }
}
