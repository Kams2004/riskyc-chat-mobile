import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type AppVersionInfo = {
  latestVersion: string | null;
  minSupportedVersion: string | null;
  playStoreUrl: string;
};

/** Unauthenticated — needs to work before sign-in, and works fine either way since apiFetch only attaches a token when one already exists. */
export function getAppVersionInfo(): Promise<AppVersionInfo> {
  return apiFetch(`${config.authServiceUrl}/api/app-version`);
}
