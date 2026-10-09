import { SetMetadata } from '@nestjs/common';

export const ALLOW_FORCED_PASSWORD_CHANGE = 'cecasem:allow-forced-password-change';
export const AllowForcedPasswordChange = () => SetMetadata(ALLOW_FORCED_PASSWORD_CHANGE, true);
