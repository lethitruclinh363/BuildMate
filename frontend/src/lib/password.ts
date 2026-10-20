/**
 * Shared password rules for BuildMate authentication (Register, Reset Password, etc.)
 * Requirements: Minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number.
 */
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export function isValidPassword(password: string): boolean {
  return PASSWORD_RE.test(password);
}
