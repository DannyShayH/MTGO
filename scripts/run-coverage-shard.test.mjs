import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

test("a failing shard preserves its full log while limiting summary output", async () => {
  const root = await mkdtemp(join(tmpdir(), "coverage-shard-test-"))
  try {
    await mkdir(join(root, "apps/backend"), { recursive: true })
    await mkdir(join(root, "bin"))
    await writeFile(
      join(root, "bin/npm"),
      '#!/bin/sh\nhead -c 1500000 /dev/zero | tr "\\0" x\nprintf "\\nFINAL ERROR\\n"\nexit 7\n',
      { mode: 0o755 },
    )
    const run = spawnSync(
      "bash",
      [fileURLToPath(new URL("./run-coverage-shard.sh", import.meta.url)), "3"],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
        },
      },
    )
    assert.equal(run.status, 7)
    assert.equal(run.stdout.length, 65536)
    assert.match(run.stdout.toString(), /FINAL ERROR/)
    const log = await readFile(join(root, "tmp/coverage-shard-3.log"))
    assert.equal(log.length, 1500013)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
