import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

export default async function handler(request: Request) {
  const user = await getUser();

  if (!user) {
    return jsonResponse({ error: "Authentication required." }, 401);
  }

  const store = getStore({ name: "workplan", consistency: "strong" });
  const planKey = `plan:${user.id}`;

  if (request.method === "GET") {
    const plan = await store.get(planKey, { type: "json" });
    return jsonResponse({ plan: plan ?? null, user: { id: user.id, email: user.email } });
  }

  if (request.method === "POST") {
    const payload = (await request.json()) as { plan?: unknown };
    if (!payload.plan || typeof payload.plan !== "object") {
      return jsonResponse({ error: "Missing plan payload." }, 400);
    }

    await store.setJSON(planKey, payload.plan);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
