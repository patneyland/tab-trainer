/**
 * localStorage implementation of the core ProgressStore.
 *
 * This is the v0.1 persistence layer: progress lives in the browser only. It deliberately
 * implements the exact same interface the future RemoteProgressStore will, so swapping in
 * a synced backend (docs/backend.md) is a one-line change at the call site.
 */

import {
  summarize,
  type AttemptRecord,
  type ProgressStore,
  type ProgressSummary,
} from '@tab-trainer/core';

const STORAGE_KEY = 'tab-trainer:attempts:v1';

function read(): AttemptRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttemptRecord[]) : [];
  } catch {
    return [];
  }
}

function write(records: AttemptRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export class LocalProgressStore implements ProgressStore {
  async record(attempt: AttemptRecord): Promise<void> {
    const records = read();
    records.push(attempt);
    write(records);
  }

  async getAll(): Promise<AttemptRecord[]> {
    return read();
  }

  async getSummary(): Promise<ProgressSummary> {
    return summarize(read());
  }

  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  }
}
