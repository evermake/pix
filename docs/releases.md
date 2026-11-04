# Releasing Pix

Each PR includes a new changeset: `pnpm changeset`, or `pnpm changeset --empty` for non-release changes.

To release:

1. Update local `main` and run `pnpm install --frozen-lockfile`; keep the working tree clean.
2. Run `pnpm release --dry-run` to preview, then `pnpm release` to open a version PR.
3. Review and merge that PR, update local `main`, and install again.
4. Run `pnpm release` again to push the shared-version tag; follow the Release workflow in GitHub Actions.

If new versioned changesets arrived meanwhile, the command prepares another version PR instead of tagging. After a failure, inspect local work before retrying; never move a published tag.

Setup requirements and command details live in the module JSDoc of [`scripts/release.ts`](../scripts/release.ts).
