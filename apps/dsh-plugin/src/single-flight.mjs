/** A repeated desktop action shares the current result rather than queuing windows. */
export class SingleFlight {
  constructor(cooldown = 1000, now = Date.now) { this.cooldown = cooldown; this.now = now; this.entries = new Map(); }
  run(key, operation) {
    for (const [id, entry] of this.entries) if (entry.until <= this.now()) this.entries.delete(id);
    const previous = this.entries.get(key);
    if (previous) return previous.promise;
    const entry = { until: Infinity, promise: null };
    entry.promise = Promise.resolve().then(operation).then(value => {
      entry.until = this.now() + this.cooldown; return value;
    }, error => { this.entries.delete(key); throw error; });
    this.entries.set(key, entry); return entry.promise;
  }
}
