export interface Match {
  score: number;
  /** Positions of the matched characters in `[...text]`. */
  indexes: number[];
}

export type KeySpec<T> = string | ((item: T) => string | undefined);

export interface SearchOptions<T> {
  /** What to search in: a property name, a dotted path, a function, or a list of those. */
  key?: KeySpec<T> | readonly KeySpec<T>[];
  limit?: number;
  minScore?: number;
  caseSensitive?: boolean;
}

export interface Result<T> {
  item: T;
  score: number;
  indexes: number[];
  /** Which of the keys matched best. */
  key: number;
}

export function score(query: string, text: string, options?: { caseSensitive?: boolean }): Match | null;
export function search<T>(items: Iterable<T>, query: string, options?: SearchOptions<T>): Result<T>[];
export function highlight(text: string, indexes: readonly number[], options?: { open?: string; close?: string; escape?: boolean }): string;
