import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Comprobar la API y su conexión con PostgreSQL' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL no está disponible.' })
  getHealth(): Promise<HealthResponseDto> {
    return this.health.check();
  }
}
