const numericParts = (version: string): number[] =>
  version.split('.').map(part => parseInt(part, 10) || 0);

/**
 * Semver-ish "is a newer than b" on dot-separated numeric parts.
 * Missing parts count as 0, so "1.2" is newer than "1.1.9" and equal
 * versions are not newer.
 */
export const newer = (a: string, b: string): boolean => {
  const aParts = numericParts(a);
  const bParts = numericParts(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
};
