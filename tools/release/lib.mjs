import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const changesetCli = fileURLToPath(import.meta.resolve("@changesets/cli/bin.js"));

export function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options })?.trim() ?? "";
}

export function packages() {
  const root = process.cwd();
  return JSON.parse(run("pnpm", ["list", "-r", "--depth=-1", "--json"]))
    .filter((pkg) => pkg.path !== root);
}

export function releasePlan(cwd = process.cwd()) {
  const directory = mkdtempSync(join(tmpdir(), "pix-release-"));
  try {
    const output = join(directory, "plan.json");
    run(process.execPath, [changesetCli, "status", `--output=${output}`], { cwd });
    return JSON.parse(readFileSync(output, "utf8"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function sharedVersion(workspacePackages) {
  if (workspacePackages.length === 0) throw new Error("No workspace packages found.");
  const versions = new Set(workspacePackages.map((pkg) => pkg.version));
  if (versions.size !== 1) throw new Error("All workspace packages must have the same version.");
  const [version] = versions;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Expected a stable semantic version.");
  return version;
}

export function nextVersion(plan, workspacePackages) {
  const current = sharedVersion(workspacePackages);
  const releases = plan.releases.filter((release) => release.type !== "none");
  const names = new Set(releases.map((release) => release.name));
  if (releases.length === 0) throw new Error("No pending versioned changesets to release.");
  if (releases.length !== workspacePackages.length || workspacePackages.some((pkg) => !names.has(pkg.name))) {
    throw new Error("The release plan must include every workspace package.");
  }
  const version = sharedVersion(releases.map((release) => ({ version: release.newVersion })));
  if (releases.some((release) => release.oldVersion !== current) ||
      version.localeCompare(current, undefined, { numeric: true }) <= 0) {
    throw new Error("The release must advance every package from the current shared version.");
  }
  return version;
}

export function verifyTag(tag, workspacePackages) {
  const expected = `v${sharedVersion(workspacePackages)}`;
  if (tag !== expected) throw new Error(`Tag must match the shared package version: ${expected}`);
}

export function addedChangesets(paths) {
  return paths.filter((path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md");
}
