# Releases

Each PR needs a new changeset: run `pnpm changeset`, or `pnpm changeset --empty` for non-release changes.

From clean, up-to-date `main`:

1. Run `pnpm release --dry-run` to preview, then `pnpm release` to open a version PR.
2. Merge it, update local `main`, and run `pnpm release` again to push the release tag and deploy.

Requires authenticated `gh` and Git signing access. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as Actions secrets; see [Alchemy's required permissions](https://alchemy.run/environments/ci#cloudflare).

After a failed command, inspect local branches/tags before retrying. For deployment failures, rerun the failed Release job; never move a published tag.
