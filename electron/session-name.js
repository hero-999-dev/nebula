/**
 * Which saved partition a session lives in, read off its folder on disk.
 *
 * Asking `session.fromPartition('persist:ai-' + id)` to compare is not a question:
 * it OPENS that partition, its databases and its journals. The first page embedded
 * in a note opened every AI service's profile, thousands of files in one second,
 * for a page that uses none of them. A fifth of a second after such a burst,
 * Malwarebytes' ransomware guard stopped the unsigned app (2026-11-02).
 *
 * @param {string|null|undefined} storagePath a session's `storagePath`: its partition's folder, null in memory
 * @returns {string|null} the partition's name without `persist:`, in lower case; null when it is not one
 */
export function persistName(storagePath) {
  const m = /[\\/]Partitions[\\/]([^\\/]+)[\\/]?$/.exec(String(storagePath ?? ''));
  return m ? m[1] : null;
}
