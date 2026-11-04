import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";
import { app } from "./app.ts";

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.url },
  Effect.succeed({ fetch: app }),
);
