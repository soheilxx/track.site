/**
 * Reconnectable turn streams without duplicate execution (supplement §9 "reconnectbarer Stream
 * ohne doppelte Toolausführung"). A turn is keyed by tenant, user, site and the client-generated
 * turn id (the idempotency key): the first request starts the work and every request with the same
 * key only attaches to it. Events are numbered, so a client that lost its connection resumes with
 * `afterSeq` and receives exactly the events it has not seen; the underlying tool execution runs
 * once regardless of how many connections come and go.
 */
export interface TurnEnvelope<E> {
  seq: number;
  event: E;
}

export interface TurnRecord<E> {
  key: string;
  status: "running" | "done";
  events: TurnEnvelope<E>[];
  startedAt: number;
  endedAt: number | null;
}

interface Subscriber<E> {
  onEvent: (envelope: TurnEnvelope<E>) => void;
  onEnd: () => void;
}

interface Entry<E> extends TurnRecord<E> {
  subscribers: Set<Subscriber<E>>;
}

export interface TurnRegistryOptions {
  /** how long a finished turn stays resumable (default 10 minutes) */
  ttlMs?: number;
  /** upper bound of remembered turns; the oldest finished ones are evicted first (default 500) */
  maxTurns?: number;
  /** events kept per turn (default 2000) */
  maxEvents?: number;
  now?: () => number;
}

export class TurnRegistry<E> {
  private readonly turns = new Map<string, Entry<E>>();
  private readonly ttlMs: number;
  private readonly maxTurns: number;
  private readonly maxEvents: number;
  private readonly now: () => number;

  constructor(options: TurnRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.maxTurns = options.maxTurns ?? 500;
    this.maxEvents = options.maxEvents ?? 2_000;
    this.now = options.now ?? Date.now;
  }

  get(key: string): TurnRecord<E> | undefined {
    this.sweep();
    return this.turns.get(key);
  }

  /**
   * Starts the turn unless one with the same key exists. `run` receives an emitter; the promise it
   * returns marks the end of the turn (rejections end it too — the caller is expected to emit its
   * own error event before rethrowing).
   */
  start(key: string, run: (emit: (event: E) => void) => Promise<void>): { created: boolean; record: TurnRecord<E> } {
    this.sweep();
    const existing = this.turns.get(key);
    if (existing) return { created: false, record: existing };
    const entry: Entry<E> = { key, status: "running", events: [], startedAt: this.now(), endedAt: null, subscribers: new Set() };
    this.turns.set(key, entry);
    const emit = (event: E) => {
      if (entry.status === "done") return;
      const envelope = { seq: entry.events.length + 1, event };
      if (entry.events.length < this.maxEvents) entry.events.push(envelope);
      for (const s of entry.subscribers) s.onEvent(envelope);
    };
    const finish = () => {
      entry.status = "done";
      entry.endedAt = this.now();
      for (const s of entry.subscribers) s.onEnd();
      entry.subscribers.clear();
      this.sweep();
    };
    void run(emit).then(finish, finish);
    return { created: true, record: entry };
  }

  /** Replays the events after `afterSeq`, then streams live events until the turn ends. Returns the unsubscribe function. */
  subscribe(key: string, afterSeq: number, subscriber: Subscriber<E>): () => void {
    const entry = this.turns.get(key);
    if (!entry) {
      subscriber.onEnd();
      return () => undefined;
    }
    for (const envelope of entry.events) if (envelope.seq > afterSeq) subscriber.onEvent(envelope);
    if (entry.status === "done") {
      subscriber.onEnd();
      return () => undefined;
    }
    entry.subscribers.add(subscriber);
    return () => {
      entry.subscribers.delete(subscriber);
    };
  }

  /** Drops finished turns older than the TTL and, above `maxTurns`, the oldest finished ones. */
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.turns) if (entry.status === "done" && entry.endedAt !== null && now - entry.endedAt > this.ttlMs) this.turns.delete(key);
    if (this.turns.size <= this.maxTurns) return;
    const finished = Array.from(this.turns.values())
      .filter((e) => e.status === "done")
      .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
    for (const e of finished) {
      if (this.turns.size <= this.maxTurns) break;
      this.turns.delete(e.key);
    }
  }

  get size(): number {
    return this.turns.size;
  }
}
