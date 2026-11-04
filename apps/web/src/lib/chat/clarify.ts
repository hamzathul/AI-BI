/**
 * Turning a clarification choice into a question the agent can answer (6.7).
 *
 * The agent is stateless (D16) and this transcript is memory-only, so a reply
 * like "the second one" would arrive with no context. A chip therefore resends
 * the original question with the chosen name, which reads correctly on its own.
 */
export function clarificationFollowUp(question: string, option: string): string {
  const base = question.trim().replace(/\s+/g, " ");
  return `${base} (use ${option})`;
}
