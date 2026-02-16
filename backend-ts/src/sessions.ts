/**
 * In-memory session store for chat history.
 */

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const sessions = new Map<string, HistoryMessage[]>();

export function getSession(sessionId: string): HistoryMessage[] {
  return sessions.get(sessionId) ?? [];
}

export function appendToSession(sessionId: string, role: "user" | "assistant", content: string): void {
  let history = sessions.get(sessionId);
  if (!history) {
    history = [];
    sessions.set(sessionId, history);
  }
  history.push({ role, content });
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
