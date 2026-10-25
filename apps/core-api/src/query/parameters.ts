/**
 * Collects bound values in SQL order and returns the matching placeholders.
 *
 * The compiler must add values in the same order they appear in the SQL text:
 * metric filters (inside SELECT) first, then WHERE filters, then LIMIT. Keeping
 * that state in one small object makes the ordering impossible to drift.
 */
export class QueryParameters {
  private readonly entries: unknown[] = [];

  add(value: unknown): string {
    this.entries.push(value);
    return `$${this.entries.length}`;
  }

  get values(): readonly unknown[] {
    return this.entries;
  }
}
