import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  POLLER_SECRET_HEADER,
  isAuthorizedPollerRequest,
  parsePollBatchRequest,
  runPollStatusBatch,
} from "@/lib/polling";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("POLLER_SECRET") ?? null;

  if (!expectedSecret) {
    return jsonResponse({ error: "POLLER_SECRET is not configured." }, 500);
  }

  const providedSecret = request.headers.get(POLLER_SECRET_HEADER);

  if (!isAuthorizedPollerRequest(providedSecret, expectedSecret)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Supabase service role configuration is missing." },
      500,
    );
  }

  try {
    const rawBody = await request.json();
    const pollRequest = parsePollBatchRequest(rawBody);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "X-Client-Info": "charger-map-edge-poller",
        },
      },
    });
    const summary = await runPollStatusBatch({
      supabase,
      request: pollRequest,
      logger: console,
    });

    return jsonResponse(summary);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      const message =
        error instanceof Error ? error.message : "Invalid poll request.";
      return jsonResponse({ error: message }, 400);
    }

    const message =
      error instanceof Error ? error.message : "Unexpected poll batch error.";
    console.error("poll-status-batch failed", error);
    return jsonResponse({ error: message }, 500);
  }
});
