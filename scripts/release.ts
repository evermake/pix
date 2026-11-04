/**
 * Shared-version releases, with a version PR before a production tag push.
 *
 * Every PR needs a new changeset (`pnpm changeset`, or `--empty` for non-release
 * changes). From clean, up-to-date main, `pnpm release --dry-run` previews the
 * next action. `pnpm release` opens a version PR when bumps are pending; after
 * merging it and updating local main, run the command again to push the tag.
 * The tag triggers the Release workflow and Alchemy production deployment.
 *
 * Requires authenticated gh, Git signing access, and Actions secrets
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN with the permissions described at
 * https://alchemy.run/environments/ci#cloudflare. `--yes` skips confirmation.
 * The check and verify subcommands provide PR and release-tag validation for CI.
 *
 * Failures preserve local work: inspect branches, changes, and tags before
 * retrying. Rerun the failed Release job for deployment failures; never move a
 * published tag. Maintainer checklist: ../docs/releases.md.
 *
 * @module
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, FileSystem, Option, Path, Schema, Stream } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class ReleaseError extends Schema.TaggedError<ReleaseError>()("ReleaseError", {
  message: Schema.String,
}) {}

const Version = Schema.String.check(Schema.isPattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/));
const Packages = Schema.Array(Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  version: Schema.optional(Version),
}));
const Plan = Schema.Struct({
  releases: Schema.Array(Schema.Struct({
    name: Schema.String,
    oldVersion: Version,
    newVersion: Version,
    type: Schema.Literals(["none", "patch", "minor", "major"]),
  })),
});

const run = Effect.fn("run")(function*(command: string, args: ReadonlyArray<string>, capture = false) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(ChildProcess.make(command, args, {
    stdin: capture ? "ignore" : "inherit",
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
  }));
  const [output, code] = yield* Effect.all([
    capture ? Stream.mkString(Stream.decodeText(child.stdout)) : Effect.succeed(""),
    child.exitCode,
  ], { concurrency: "unbounded" });
  if (code !== 0) return yield* new ReleaseError({ message: `${command} ${args.join(" ")} failed (${code}).` });
  return output.trim();
}, Effect.scoped);

const packages = Effect.fn("packages")(function*() {
  const output = yield* run("pnpm", ["list", "-r", "--depth=-1", "--json"], true);
  const all = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Packages))(output);
  const workspace = all.filter((pkg) => pkg.path !== process.cwd());
  const first = workspace[0]?.version;
  if (!first || workspace.some((pkg) => pkg.version !== first)) {
    return yield* new ReleaseError({ message: "All workspace packages must have one shared stable version." });
  }
  return { workspace, version: first };
});

const releasePlan = Effect.fn("releasePlan")(function*() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "pix-release-" });
  const output = path.join(directory, "plan.json");
  const cli = path.fromFileUrl(new URL(import.meta.resolve("@changesets/cli/bin.js")));
  yield* run(process.execPath, [yield* cli, "status", `--output=${output}`]);
  const content = yield* fs.readFileString(output);
  const plan = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Plan))(content);
  return plan.releases.filter((release) => release.type !== "none");
}, Effect.scoped);

const tags = Effect.fn("tags")(function*() {
  const output = yield* run("git", ["tag", "--list", "v*", "--sort=-version:refname"], true);
  return output.split("\n").filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
});

const release = Command.make("release", {
  dryRun: Flag.Boolean("dry-run").pipe(Flag.withDefault(false), Flag.withDescription("Preview without changing files or pushing")),
  yes: Flag.Boolean("yes").pipe(Flag.withDefault(false), Flag.withDescription("Skip confirmation")),
}, Effect.fn("release")(function*({ dryRun, yes }) {
  const { workspace, version: current } = yield* packages();
  const plan = yield* releasePlan();
  const preparing = plan.length > 0;
  const version = plan[0]?.newVersion ?? current;
  if (preparing && (plan.length !== workspace.length || workspace.some((pkg) =>
    !plan.some((item) => item.name === pkg.name && item.oldVersion === current && item.newVersion === version)
  ) || version.localeCompare(current, undefined, { numeric: true }) <= 0)) {
    return yield* new ReleaseError({ message: "The plan must advance every workspace package to one shared version." });
  }
  if (version === "0.0.0") return yield* new ReleaseError({ message: "No versioned release has been prepared." });
  const tag = `v${version}`;
  const branch = `release/${tag}`;
  yield* Console.log(`${preparing ? "Prepare a version PR for" : "Tag and deploy"} ${tag}`);
  if (dryRun) return;

  if ((yield* run("git", ["branch", "--show-current"], true)) !== "main" ||
    (yield* run("git", ["status", "--porcelain"], true))) {
    return yield* new ReleaseError({ message: "Release from a clean main branch only." });
  }
  yield* run("git", ["fetch", "origin", "main", "--tags"]);
  if ((yield* run("git", ["rev-parse", "HEAD"], true)) !== (yield* run("git", ["rev-parse", "origin/main"], true))) {
    return yield* new ReleaseError({ message: "Local main must exactly match origin/main. Pull before releasing." });
  }
  if ((yield* tags()).some((existing) => existing.slice(1).localeCompare(version, undefined, { numeric: true }) >= 0)) {
    return yield* new ReleaseError({ message: "The version must be newer than every existing release tag." });
  }
  if (!yes) {
    const action = preparing ? "Create and push a version PR" : "Push a tag and deploy production";
    const answer = yield* Prompt.String({ message: `${action}? Type ${tag} to confirm` });
    if (answer !== tag) return yield* new ReleaseError({ message: "Release cancelled." });
  }
  for (const script of ["test", "typecheck", "lint"]) yield* run("pnpm", [script]);
  if (!preparing) {
    yield* run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
    yield* run("git", ["push", "origin", `refs/tags/${tag}`]);
    yield* Console.log(`Pushed ${tag}. Follow the Release workflow in GitHub Actions.`);
    return;
  }

  yield* run("gh", ["auth", "status"]);
  yield* run("git", ["switch", "-c", branch]);
  yield* run("pnpm", ["exec", "changeset", "version"]);
  yield* run("pnpm", ["install", "--lockfile-only"]);
  if ((yield* packages()).version !== version) {
    return yield* new ReleaseError({ message: "Versioned packages differ from the release plan." });
  }
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(`.changeset/release-${tag}.md`, `---\n{}\n---\n\nPrepare the shared ${tag} release.\n`, { flag: "wx" });
  yield* run("pnpm", ["lint"]);
  yield* run("git", ["diff", "--check"]);
  yield* run("git", ["add", "--", ".changeset", "packages", "pnpm-lock.yaml"]);
  yield* run("git", ["commit", "-m", `chore: release ${tag}`]);
  yield* run("git", ["push", "--set-upstream", "origin", branch]);
  yield* run("gh", ["pr", "create", "--base", "main", "--head", branch,
    "--title", `chore: release ${tag}`, "--body",
    `Version every package to ${version}. After merging, update local main and run pnpm release again to push ${tag} and deploy production.`]);
  yield* Console.log("After merging the version PR, update local main and run pnpm release again.");
}));

const check = Command.make("check", {
  base: Argument.String("base").pipe(Argument.withDefault("origin/main")),
}, Effect.fn("check")(function*({ base }) {
  const output = yield* run("git", ["diff", "--diff-filter=A", "--name-only", `${base}...HEAD`, "--", ".changeset"], true);
  if (!output.split("\n").some((file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md")) {
    return yield* new ReleaseError({ message: "Every PR needs a new changeset. Run pnpm changeset (or pnpm changeset --empty)." });
  }
  yield* packages();
  yield* releasePlan();
  yield* Console.log("PR includes a new changeset and the release plan is valid.");
}));

const verify = Command.make("verify", {
  tag: Argument.String("tag").pipe(Argument.optional),
}, Effect.fn("verify")(function*({ tag }) {
  const name = Option.isSome(tag) ? tag.value : yield* Config.String("GITHUB_REF_NAME");
  const { version } = yield* packages();
  if (name !== `v${version}`) return yield* new ReleaseError({ message: `Tag must match the shared version: v${version}` });
  yield* run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
  if ((yield* releasePlan()).length > 0) return yield* new ReleaseError({ message: "Merge a version PR before tagging." });
  if (name !== (yield* tags())[0]) return yield* new ReleaseError({ message: "Refusing to deploy an older release tag." });
  yield* Console.log(`Verified ${name}.`);
}));

release.pipe(
  Command.withSubcommands([check, verify]),
  Command.run({ version: "0.0.0" }),
  Effect.tapError(() => Console.error("Stopped without rolling back local work. Inspect git status and tags before retrying.")),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
