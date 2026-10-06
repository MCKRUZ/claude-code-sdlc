// One identity module for the renderer (togo-command-center.md §2.1). Every "is this me?" on a
// screen — the "you" ring on initials, the Mine filter, the needs-you list, the lit cards in
// "In the room" — compares through `samePerson`, so two parts of the product can never disagree
// about who a handle is. Pure: no IPC, no roster lookup, no guessing. The actor itself is
// resolved ONCE in the main process (`actor.ts`); this file only compares what it was handed.
//
// What it refuses to do: match by display name, match a prefix, or treat an Azure UPN that the
// roster does not know as anyone in particular — that reads "unmapped" (references/team-model.md).

/** `@Sam-K ` and `sam-k` are one person; the roster's own form is `@handle`. */
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase()
}

/** True when both are present and name the same handle. Null, undefined and blank never match
 * anybody — "nobody" is not a person. */
export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const na = normalizeHandle(a)
  const nb = normalizeHandle(b)
  return na !== '' && na === nb
}

/** The roster roles a row can name (spec frontmatter + the sprint layer's `next_owner`). */
export type RoleField = 'owner' | 'developer' | 'checker' | 'nextOwner'
export const ROLE_FIELDS: readonly RoleField[] = ['owner', 'developer', 'checker', 'nextOwner']

/** Which role fields of a row name this person — a set, because owner and developer may be the
 * same person. Empty when there is no actor. Used by the Mine filter and the room's lane dots. */
export function rolesHeld(
  row: Partial<Record<RoleField, string | null | undefined>>,
  me: string | null | undefined,
): RoleField[] {
  if (!me) return []
  return ROLE_FIELDS.filter((field) => samePerson(row[field], me))
}

/** True for a value shaped like an Azure DevOps sign-in (a UPN / email). Shape only — it says
 * nothing about whether the roster knows them. */
export function looksLikeUpn(value: string | null | undefined): boolean {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** The word a screen shows beside a host identity the roster could not map. */
export const UNMAPPED = 'unmapped'

/** How to label the signed-in person: the roster handle when there is one; a UPN the roster does
 * not know reads "sam@corp.com · unmapped"; anything else (a GitHub login, a typed name) as-is.
 * Null when nobody is identified — the caller shows `reasons.NO_ACTOR`, never a blank. */
export function identityLabel(account: string | null | undefined, rosterHandle: string | null | undefined): string | null {
  if (rosterHandle && rosterHandle.trim()) return rosterHandle.trim()
  if (!account || !account.trim()) return null
  const trimmed = account.trim()
  return looksLikeUpn(trimmed) ? `${trimmed} · ${UNMAPPED}` : trimmed
}
