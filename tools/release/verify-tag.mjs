import { packages, releasePlan, run, verifyTag } from "./lib.mjs";

try {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  verifyTag(tag, packages());
  run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
  if (releasePlan().releases.some((release) => release.type !== "none")) {
    throw new Error("Release tags must have no pending version bumps. Merge a version PR first.");
  }
  const latest = run("git", ["tag", "--list", "v*", "--sort=-version:refname"])
    .split("\n").find((name) => /^v\d+\.\d+\.\d+$/.test(name));
  if (tag !== latest) throw new Error("Refusing to deploy an older tag after a newer release tag was pushed.");
  console.log(`Verified ${tag}: shared versions, no pending version bumps, and commit on main.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
