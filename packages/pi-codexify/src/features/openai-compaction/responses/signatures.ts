export type TextSignaturePhase = 'commentary' | 'final_answer';

export function shortHash(str: string): string {
  let h1 = 3_735_928_559;
  let h2 = 1_103_547_991;
  for (let i = 0; i < str.length; i++) {
    const ch = str.codePointAt(i)!;
    h1 = Math.imul(h1 ^ ch, 2_654_435_761);
    h2 = Math.imul(h2 ^ ch, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export function encodeTextSignatureV1(id: string, phase?: string): string {
  const payload: { v: 1; id: string; phase?: string | undefined } = { v: 1, id };
  if (phase) payload.phase = phase;
  return JSON.stringify(payload);
}

export function parseTextSignature(
  signature: string | undefined
): { id: string; phase?: TextSignaturePhase | undefined } | undefined {
  if (!signature) return undefined;
  if (signature.startsWith('{')) {
    try {
      const parsed = JSON.parse(signature) as {
        v?: number | undefined;
        id?: string | undefined;
        phase?: TextSignaturePhase | string | undefined;
      };
      if (parsed.v === 1 && typeof parsed.id === 'string') {
        return parsed.phase === 'commentary' || parsed.phase === 'final_answer'
          ? { id: parsed.id, phase: parsed.phase }
          : { id: parsed.id };
      }
    } catch {
      // Fall through to legacy plain-string handling.
    }
  }
  return { id: signature };
}
