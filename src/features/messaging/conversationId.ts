/**
 * A 1:1 conversation needs the SAME id on both ends — whoever starts it —
 * since it's also the STOMP topic both parties publish/subscribe to. Using
 * "the other person's id" (what this used to do) gives each side a
 * DIFFERENT id (Alice→Bob uses Bob's id, Bob→Alice uses Alice's id), so the
 * two devices are on different topics and never see each other's messages.
 * Sorting the pair makes it deterministic regardless of who initiates.
 */
export function conversationIdFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join('_');
}

/**
 * Local storage only keeps the canonical conversationId (see LocalConversation
 * — there's no separate "other user id" column), so reopening a conversation
 * from the chat list has to recover the other party's id from that compound
 * string plus my own id. Getting this wrong doesn't just mis-route a display
 * name: recipientId also feeds sendMessage's envelope and markReadIfMine's
 * comparison, so a wrong value here silently breaks delivery/read acks for
 * every message sent from a re-opened conversation.
 */
export function otherPartyFrom(conversationId: string, myUserId: string): string {
  const [a, b] = conversationId.split('_');
  return a === myUserId ? b : a;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A stored conversation title that's just someone's raw id, not a resolved name. */
export function looksLikeUnresolvedName(title: string): boolean {
  return UUID_PATTERN.test(title);
}
