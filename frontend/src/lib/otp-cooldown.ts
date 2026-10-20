export function getOtpCooldown(email: string): number {
  if (!email || typeof window === 'undefined') return 0;
  try {
    const raw = sessionStorage.getItem(`bm_otp_cooldown_${email.trim().toLowerCase()}`);
    if (!raw) return 0;
    const expire = Number(raw);
    const remaining = Math.ceil((expire - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

export function setOtpCooldown(email: string, seconds = 60) {
  if (!email || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`bm_otp_cooldown_${email.trim().toLowerCase()}`, String(Date.now() + seconds * 1000));
  } catch {
    // ignore
  }
}
