import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { writeFileSync } from "node:fs";
import { nextVersion, packages, releasePlan, run, sharedVersion } from "./lib.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--dry-run", "--yes"].includes(arg))) {
    throw new Error("Usage: pnpm release [--dry-run] [--yes]");
  }
  const plan = releasePlan();
  const preparing = plan.releases.some((release) => release.type !== "none");
  const version = preparing ? nextVersion(plan, packages()) : sharedVersion(packages());
  const tag = `v${version}`;
  const branch = `release/${tag}`;
  console.log(`${preparing ? "Prepare a version PR for" : "Tag and deploy"} ${tag} (all workspace packages)`);
  if (version === "0.0.0") throw new Error("No versioned release has been prepared yet.");
  if (args.includes("--dry-run")) return;

  if (run("git", ["branch", "--show-current"]) !== "main") throw new Error("Release from main only.");
  if (run("git", ["status", "--porcelain"])) throw new Error("Working tree must be clean.");
  run("git", ["fetch", "origin", "main", "--tags"]);
  if (run("git", ["rev-parse", "HEAD"]) !== run("git", ["rev-parse", "origin/main"])) {
    throw new Error("Local main must exactly match origin/main. Pull before releasing.");
  }
  if (run("git", ["tag", "--list", tag])) throw new Error(`${tag} already exists.`);
  const newerTags = run("git", ["tag", "--list", "v*", "--sort=-version:refname"])
    .split("\n").filter((name) => /^v\d+\.\d+\.\d+$/.test(name));
  if (newerTags.some((name) => name.slice(1).localeCompare(version, undefined, { numeric: true }) >= 0)) {
    throw new Error("The release version must be newer than every existing release tag.");
  }

  if (!args.includes("--yes")) {
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      const action = preparing ? "Create and push a version PR" : "Push a tag and deploy production";
      if (await prompt.question(`${action} for ${tag}? Type ${tag} to confirm: `) !== tag) {
        throw new Error("Release cancelled.");
      }
    } finally {
      prompt.close();
    }
  }

  for (const script of ["test", "typecheck", "lint"]) run("pnpm", [script], { stdio: "inherit" });
  if (!preparing) {
    run("git", ["tag", "-a", tag, "-m", `Release ${tag}`], { stdio: "inherit" });
    run("git", ["push", "origin", `refs/tags/${tag}`], { stdio: "inherit" });
    console.log(`Pushed ${tag}. Follow the Release workflow in GitHub Actions.`);
    return;
  }

  run("gh", ["auth", "status"], { stdio: "inherit" });
  run("git", ["switch", "-c", branch], { stdio: "inherit" });
  run("pnpm", ["exec", "changeset", "version"], { stdio: "inherit" });
  run("pnpm", ["install", "--lockfile-only"], { stdio: "inherit" });
  if (sharedVersion(packages()) !== version) throw new Error("Versioned packages differ from the release plan.");
  writeFileSync(`.changeset/release-${tag}.md`, `---\n{}\n---\n\nPrepare the shared ${tag} release. This metadata-only changeset does not request another version bump.\n`, { flag: "wx" });
  run("pnpm", ["lint"], { stdio: "inherit" });
  run("git", ["diff", "--check"], { stdio: "inherit" });
  run("git", ["add", "--", ".changeset", "packages", "pnpm-lock.yaml"]);
  run("git", ["commit", "-m", `chore: release ${tag}`], { stdio: "inherit" });
  run("git", ["push", "--set-upstream", "origin", branch], { stdio: "inherit" });
  run("gh", ["pr", "create", "--base", "main", "--head", branch,
    "--title", `chore: release ${tag}`, "--body",
    `Version every workspace package to ${version} and consume pending changesets. After merging, update local main and run pnpm release again to push ${tag} and deploy production.`], { stdio: "inherit" });
  console.log(`After merging the version PR, update local main and run pnpm release again to tag ${tag}.`);
}

main().catch((error) => {
  console.error(error.message);
  console.error("Stopped without rolling back local work. Inspect git status and tags before retrying.");
  process.exitCode = 1;
});
