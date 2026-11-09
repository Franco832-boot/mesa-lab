/** Address explicitly confirmed by the owner; never inferred from project data. */
export const CONTACT_EMAIL = 'losprofesparavos073@gmail.com';
export function contactMailto(subject: string, body: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
}
