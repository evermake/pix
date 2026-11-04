import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addedChangesets, changesetCli, nextVersion, releasePlan, run, sharedVersion, verifyTag } from "./lib.mjs";

const workspacePackages = [
  { name: "@pix/cloud", version: "1.2.3" },
  { name: "another-package", version: "1.2.3" },
];

function plan(version, type = "patch") {
  return { releases: workspacePackages.map((pkg) => ({
    name: pkg.name, oldVersion: pkg.version, newVersion: version, type,
  })) };
}

test("command runner supports inherited or ignored output and stops on failures", () => {
  assert.equal(run(process.execPath, ["-e", "process.stdout.write('ok')"]), "ok");
  assert.equal(run(process.execPath, ["-e", ""], { stdio: "ignore" }), "");
  assert.throws(() => run(process.execPath, ["-e", "process.exit(1)"], { stdio: "ignore" }));
});

test("calculates one shared release from the Changesets plan", () => {
  assert.equal(nextVersion(plan("1.2.4"), workspacePackages), "1.2.4");
  assert.equal(nextVersion(plan("1.3.0", "minor"), workspacePackages), "1.3.0");
  assert.equal(nextVersion(plan("2.0.0", "major"), workspacePackages), "2.0.0");
});

test("refuses no-op, partial, divergent, non-advancing, and prerelease plans", () => {
  assert.throws(() => nextVersion({ releases: [] }, workspacePackages), /No pending/);
  assert.throws(() => nextVersion({ releases: plan("1.2.4").releases.slice(0, 1) }, workspacePackages), /every workspace/);
  assert.throws(() => sharedVersion([]), /No workspace/);
  assert.throws(() => sharedVersion([{ version: "1.0.0" }, { version: "2.0.0" }]), /same version/);
  assert.throws(() => nextVersion(plan("1.2.3"), workspacePackages), /advance/);
  assert.throws(() => nextVersion(plan("1.2.2"), workspacePackages), /advance/);
  assert.throws(() => nextVersion(plan("1.3.0-beta.1"), workspacePackages), /stable/);
});

test("requires an exact stable tag matching every package", () => {
  verifyTag("v1.2.3", workspacePackages);
  for (const tag of ["1.2.3", "v1.2.4", "v1.2.3-beta.1", undefined]) {
    assert.throws(() => verifyTag(tag, workspacePackages), /Tag must match/);
  }
});

test("PR check accepts only new changeset markdown files, not the guide", () => {
  assert.deepEqual(addedChangesets([
    ".changeset/new-change.md", ".changeset/README.md", ".changeset/config.json",
    "docs/change.md", ".changeset/nested/change.md",
  ]), [".changeset/new-change.md"]);
});

test("real Changesets CLI versions all private packages together and consumes notes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pix-changesets-test-"));
  const json = (path, value) => writeFileSync(join(cwd, path), `${JSON.stringify(value)}\n`);
  try {
    mkdirSync(join(cwd, ".changeset"));
    for (const name of ["cloud", "other"]) mkdirSync(join(cwd, "packages", name), { recursive: true });
    json("package.json", { name: "fixture", private: true, packageManager: "pnpm@12.16.1" });
    writeFileSync(join(cwd, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    json(".changeset/config.json", JSON.parse(readFileSync(new URL("../../.changeset/config.json", import.meta.url), "utf8")));
    json("packages/cloud/package.json", { ...workspacePackages[0], private: true });
    json("packages/other/package.json", { ...workspacePackages[1], private: true });
    writeFileSync(join(cwd, ".changeset/feature.md"), '---\n"@pix/cloud": minor\n---\n\nAdd a feature.\n');
    writeFileSync(join(cwd, ".changeset/fix.md"), '---\n"another-package": patch\n---\n\nFix a bug.\n');
    run("git", ["init", "--initial-branch=main"], { cwd });
    run("git", ["-c", "user.name=Release Test", "-c", "user.email=release-test@example.test",
      "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture"], { cwd });

    assert.equal(nextVersion(releasePlan(cwd), workspacePackages), "1.3.0");
    run(process.execPath, [changesetCli, "version"], { cwd });
    for (const directory of ["cloud", "other"]) {
      assert.equal(JSON.parse(readFileSync(join(cwd, "packages", directory, "package.json"), "utf8")).version, "1.3.0");
      assert.match(readFileSync(join(cwd, "packages", directory, "CHANGELOG.md"), "utf8"), /1\.3\.0/);
    }
    const consumed = releasePlan(cwd);
    assert.equal(consumed.changesets.length, 0);
    assert.throws(() => nextVersion(consumed, workspacePackages), /No pending/);
    writeFileSync(join(cwd, ".changeset/release-v1.3.0.md"), '---\n{}\n---\n\nPrepare the shared release.\n');
    const metadataOnly = releasePlan(cwd);
    assert.equal(metadataOnly.changesets.length, 1);
    assert.equal(metadataOnly.releases.length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
