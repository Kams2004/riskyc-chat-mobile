import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/push-tokens`, {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}
