// Execute these statements in the same D1 batch as the transfer insert. A failed
// CHECK rolls back every reservation and the transfer together under concurrency.
export function quotaStatements(
  db: Pick<D1Database, "prepare">,
  key: string,
  day: number,
  bytes: number,
) {
  return [
    ...[key, "global"].map((k) =>
      db
        .prepare(
          "INSERT INTO admission_quotas(key,day,bytes,count) VALUES (?,?,?,1) ON CONFLICT(key,day) DO UPDATE SET bytes=bytes+excluded.bytes,count=count+1",
        )
        .bind(k, day, bytes),
    ),
    db
      .prepare("UPDATE storage_budget SET bytes=bytes+? WHERE id=1")
      .bind(bytes),
  ];
}
