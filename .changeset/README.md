# Changesets and releases

## Every pull request

Run `pnpm changeset`, select the affected packages and bump type, and write a short description of the change. Commit the generated `.changeset/*.md` file in the PR. CI requires a newly added changeset, not an edit to an older one. For documentation/tooling changes that do not need a release, use `pnpm changeset --empty`.

All workspace packages under `packages/*`, including private packages, belong to one fixed version group. A change to any package bumps every package to the same version; the largest requested bump wins. The root is unversioned workspace tooling. New packages must start at the current shared version. We deploy applications; we do not publish packages to npm.

## Prepare CI once

Configure these GitHub Actions secrets in the repository or its `production` environment:

- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account.
- `CLOUDFLARE_API_TOKEN`: a token scoped to that account, with Workers Scripts Write, Workers KV Storage Write, Account Settings Write, and Secrets Store Write for the Worker and Alchemy's Cloudflare state backend. See the [Alchemy CI guide](https://alchemy.run/environments/ci#cloudflare) for the current permissions and additional permissions when adding resources.

The existing `Cloudflare.state()` backend persists deployment state across runners. Alchemy may bootstrap its state Worker and backing resources on the first production deploy. There is no separate local state file to upload or encryption password to invent. Credentials are exposed only to the release job, never to PR CI. This PR does not create credentials, configure secrets, or deploy infrastructure.

Optionally require reviewers for the `production` environment and restrict it to release tags. To enforce the changeset policy on merges, mark the `CI / checks` job as required in the repository's main-branch rules.

## Trigger a release manually

After merging PRs, use your normal Git credentials (not a workflow's `GITHUB_TOKEN`):

```sh
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm release --dry-run
pnpm release
```

`--dry-run` only previews the version calculated by Changesets; it does not version files, commit, tag, push, or deploy. It can also run on a feature branch. With this PR's minor changeset, the first release is `v0.1.0`.

The real command requires a clean `main` exactly matching `origin/main`, fetches tags, refuses duplicate or older tags, and asks you to type the calculated tag to confirm the action. Use `pnpm release --yes` only when you deliberately want to skip that confirmation. It respects the repository's rule against pushes to `main`:

1. **Pending version bumps:** run checks, create `release/vX.Y.Z`, consume pending changesets, generate package changelogs, update the lockfile, commit the versions, push that branch, and open a version PR using `gh`. No tag is pushed and nothing deploys. A new metadata-only changeset documents the version PR without requesting another bump, so it passes the same PR policy.
2. **Review and merge the version PR.** Update local `main` with `git switch main`, `git pull --ff-only`, and `pnpm install --frozen-lockfile`.
3. **Run `pnpm release` again.** With no pending version bumps, the script uses the shared package version to create an annotated `vX.Y.Z` tag and pushes only that tag. This triggers production deployment. If more versioned changesets were merged in the meantime, it prepares another version PR instead of tagging unversioned changes.

The script requires GitHub CLI (`gh`) authentication and permission to push branches/tags and open PRs. Git signing uses your normal configuration; if 1Password denies access, the command stops rather than disabling signing. A failed command never discards your local changes. Metadata-only changesets are consumed by the next version PR and never create releases on their own.

Pushing a release tag triggers `.github/workflows/release.yml`. It checks the shared package versions against the tag, verifies that the commit is on `main` and no version bumps remain pending, refuses stale tags, reruns checks, validates Cloudflare credentials, and runs `pnpm run deploy`. Every deployable package must define a `deploy` script using Alchemy with the stable `prod` stage. The root deploy command runs these scripts in dependency order. Library-only packages can omit `deploy`.

Production releases are serialized and an in-progress deploy is never cancelled by another tag. A release can include multiple stack deployments; it is not a cross-stack transaction. If a later stack fails, earlier deployments are not automatically rolled back.

## Failures

Do not run `pnpm release` a second time blindly after a signing, tagging, PR creation, or push failure. Inspect the local branch, commit, changes, and tags first. If a version branch was pushed but PR creation failed, open the PR for that branch manually. If a tag exists locally but its push failed, fix permissions and retry `git push origin refs/tags/vX.Y.Z` with the same calculated tag; do not force-push or recreate an existing remote tag. Never bypass branch protection or disable signing to get around permission failures.

If the tag was pushed but deployment failed, fix credentials or infrastructure and rerun the failed Release job for the same tag. Never move the tag to new code; code fixes need a new changeset and release. Pushing from a workflow with `GITHUB_TOKEN` would not trigger a second workflow; the manual local push intentionally avoids that limitation.
