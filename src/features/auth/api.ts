import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type Identifier = { type: 'phone'; value: string } | { type: 'email'; value: string };

function identifierBody(identifier: Identifier) {
  return identifier.type === 'phone' ? { phoneNumber: identifier.value } : { email: identifier.value };
}

/**
 * Normally resolves to undefined (a plain 202 Accepted, empty body) and the
 * caller pushes the code-entry screen next. The one exception is the
 * system-account access identifier (see auth-service's SystemAccountService)
 * — the server skips the whole OTP flow for it and returns a real token
 * payload here instead, which the caller detects and uses to sign in
 * directly, no code screen involved.
 */
export function requestOtp(identifier: Identifier): Promise<VerifyOtpResponse | undefined> {
  return apiFetch(`${config.authServiceUrl}/api/auth/otp/request`, {
    method: 'POST',
    body: JSON.stringify(identifierBody(identifier)),
  });
}

export type VerifyOtpResponse = {
  // Null exactly when requiresDeviceSwitchConfirmation is true — see below.
  accessToken: string | null;
  userId: string;
  // Populated straight from the account row when one already exists — lets
  // the caller skip profile setup for a returning user instead of asking
  // their name again every time they sign back in.
  displayName: string | null;
  avatarObjectKey: string | null;
  email: string | null;
  phoneNumber: string | null;
  // This account is already open on another phone — the OTP itself was
  // correct (that's how the confirmationToken below was earned), but login
  // hasn't completed yet. Ask the user to confirm signing the other phone
  // out; on yes, pass confirmationToken to confirmDeviceSwitch. On no,
  // just discard it — nothing has been persisted server-side, so there's
  // nothing to undo.
  requiresDeviceSwitchConfirmation: boolean;
  confirmationToken: string | null;
  conflictingDeviceLabel: string | null;
};

/** platform: 'mobile' is what triggers the one-active-mobile-session-per-account check server-side — see AuthController.OtpVerifyRequest's own doc comment. */
export function verifyOtp(identifier: Identifier, code: string, deviceLabel?: string | null): Promise<VerifyOtpResponse> {
  return apiFetch(`${config.authServiceUrl}/api/auth/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ ...identifierBody(identifier), code, deviceLabel, platform: 'mobile' }),
  });
}

/** Completes a login that verifyOtp paused on requiresDeviceSwitchConfirmation — see that field's own doc comment. */
export function confirmDeviceSwitch(confirmationToken: string): Promise<VerifyOtpResponse> {
  return apiFetch(`${config.authServiceUrl}/api/auth/otp/verify/confirm-device-switch`, {
    method: 'POST',
    body: JSON.stringify({ confirmationToken }),
  });
}
