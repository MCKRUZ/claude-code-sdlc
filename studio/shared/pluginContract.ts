/** The `document_shape_cli.py read` contract this Studio is written against. It mirrors
 * READ_CONTRACT in the plugin's scripts/document_shape_cli.py, where the meaning of each number
 * is written down; raise both together.
 *
 * Studio and the plugin are installed separately, so the plugin Studio finds can be older than
 * Studio. A version number cannot reliably say so (it went unbumped for months), but a plugin
 * can only claim a capability it has — and one that predates the marker never sent it. */
export const EXPECTED_READ_CONTRACT = 2

/** True when the plugin's `read` output says it is older than this Studio expects. A missing
 * contract is the old-plugin case, so it counts as behind. A NEWER plugin is not behind: it
 * only adds, and Studio ignores what it does not know. */
export function pluginIsBehind(contract: number | undefined): boolean {
  return (contract ?? 1) < EXPECTED_READ_CONTRACT
}
