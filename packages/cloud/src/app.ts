import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

export const app = Effect.sync(() => HttpServerResponse.text("Hello from Pix!"));
