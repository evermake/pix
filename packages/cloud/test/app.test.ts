import * as HttpEffect from "effect/http/HttpEffect";
import { expect, test } from "vitest";
import { app } from "../src/app.ts";

test("responds to GET / with a greeting", async () => {
  const fetch = HttpEffect.toWebHandler(app);

  const response = await fetch(new Request("https://pix.test/"));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain");
  expect(await response.text()).toBe("Hello from Pix!");
});
