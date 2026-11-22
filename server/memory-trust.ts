// Memory loads into every later turn, so it is where a planted instruction would persist (SpAIware, 2024; MINJA,
// arXiv 2503.03704). Security invariant: nothing brought into memory from another app that reads as an instruction is
// kept at all.

/** Instruction-like text a fact never needs: overriding rules, sending data somewhere, reaching for keys. */
const THREATS: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b.{0,30}\b(?:previous|prior|above|earlier|all|system|your)\b.{0,20}\b(?:instructions?|rules?|prompts?|guidelines?)\b/i,
  /\b(?:always|from now on|every time|whenever|automatically)\b.{0,80}\b(?:cc|bcc|forward|send|e-?mail|post|upload|share|copy|transfer|pay|wire)\b.{0,80}(?:@[\w-]+\.|https?:\/\/|\b[\w.+-]+@[\w-]+\.\w)/i,
  /\b(?:send|forward|upload|post|exfiltrate|leak)\b.{0,60}\b(?:to|at|into)\b.{0,20}(?:https?:\/\/|\b[\w.+-]+@[\w-]+\.\w)/i,
  /\b(?:authorized_keys|id_rsa|id_ed25519)\b|~\/\.ssh\b|\.env\b|\b(?:api[_ -]?key|password|secret|token)s?\b.{0,40}\b(?:send|share|post|reveal|print)\b/i,
  /\b(?:system prompt|developer (?:message|mode)|jailbreak)\b/i,
  /\bexfiltrat/i,
];

export function looksLikeInstruction(text: string): boolean {
  return THREATS.some((pattern) => pattern.test(text));
}
