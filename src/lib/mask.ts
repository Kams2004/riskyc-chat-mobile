/**
 * Masks an email or phone number for display — the account identifier
 * (settings, account details) shouldn't show up in full plain text just
 * because a screen renders it; someone glancing at the phone still shouldn't
 * be able to read it off.
 */
export function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) {
    const [local, domain] = identifier.split('@');
    if (local.length <= 2) return `${local.slice(0, 1)}***@${domain}`;
    return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
  }
  if (identifier.length <= 4) return `***${identifier.slice(-2)}`;
  return `${identifier.slice(0, 3)}***${identifier.slice(-2)}`;
}
