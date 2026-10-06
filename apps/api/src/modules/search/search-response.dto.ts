import { ApiProperty } from '@nestjs/swagger';
import type { SearchEmail, SearchOrganization, SearchPage, SearchPerson } from '../directory/directory-search.contract';
import type { SearchProcess } from '../relationships/relationship-search.service';
import type { EmailHistory } from '../communications/communication-search.service';

export class SearchResponseDto {
  @ApiProperty() query!: string;
  @ApiProperty({ type: Object }) organizations!: SearchPage<SearchOrganization>;
  @ApiProperty({ type: Object }) people!: SearchPage<SearchPerson>;
  @ApiProperty({ type: Object, nullable: true }) email!: SearchEmail | null;
  @ApiProperty({ type: Object, nullable: true, description: 'null cuando falta permiso de lectura; página común, sin ocultar procesos cerrados.' }) processes!: SearchPage<SearchProcess> | null;
  @ApiProperty({ type: Object, nullable: true, description: 'Snapshots exactos, incluso invalidados. Último contacto válido independiente de la página. null si no es correo o falta permiso.' }) emailHistory!: EmailHistory | null;
}
