// After the browser tests: remove the run's account and everything it made.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

export default async function teardown() {
  if (!existsSync(RUN_FILE)) return;
  const { userId, collectionId } = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
  sql(`delete from reads where creator_id = ${q(userId)}; delete from likes where creator_id = ${q(userId)}; delete from solves where creator_id = ${q(userId)};
    delete from games where author_id = ${q(userId)}; delete from memberships where creator_id = ${q(userId)};
    delete from collections where id = ${q(collectionId)}; delete from sessions where user_id = ${q(userId)};
    delete from accounts where user_id = ${q(userId)}; delete from creators where id = ${q(userId)}`);
  rmSync(RUN_FILE); rmSync("tests/e2e/.auth.json", { force: true });
}
