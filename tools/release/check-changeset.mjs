import { addedChangesets, packages, releasePlan, run, sharedVersion } from "./lib.mjs";

try {
  const base = process.argv[2] ?? "origin/main";
  const paths = run("git", ["diff", "--diff-filter=A", "--name-only", `${base}...HEAD`, "--", ".changeset"])
    .split("\n");
  if (addedChangesets(paths).length === 0) {
    throw new Error("Every PR needs a new changeset. Run pnpm changeset (or pnpm changeset --empty for non-release changes).");
  }
  sharedVersion(packages());
  releasePlan();
  console.log("PR includes a new changeset and the release plan is valid.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
