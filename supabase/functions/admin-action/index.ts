import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const password = Deno.env.get("ADMIN_PASSWORD");
    if (!password || body.password !== password) return json({ error: "Şifre yanlış." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey);
    const action = body.action;

    if (action === "check") return json({ ok: true });

    if (action === "upload-url") {
      const path = String(body.path || "");
      if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(path)) return json({ error: "Dosya yolu geçersiz." }, 400);
      const { data, error } = await db.storage.from("ritim-music").createSignedUploadUrl(path);
      if (error) return json({ error: error.message }, 400);
      return json({ path: data.path, token: data.token });
    }

    if (action === "save-song") {
      const { title, artist, lyrics, file_path, duration } = body;
      if (!title || !file_path) return json({ error: "Şarkı bilgileri eksik." }, 400);
      const { error } = await db.from("songs").insert({
        title, artist: artist || "", lyrics: lyrics || "", file_path, duration: Number(duration) || 0,
      });
      if (error) {
        await db.storage.from("ritim-music").remove([file_path]);
        return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    if (action === "delete-song") {
      const { id, file_path } = body;
      if (!id || !file_path) return json({ error: "Silinecek şarkı bilgisi eksik." }, 400);
      const { error: rowError } = await db.from("songs").delete().eq("id", id);
      if (rowError) return json({ error: rowError.message }, 400);
      const { error: fileError } = await db.storage.from("ritim-music").remove([file_path]);
      if (fileError) return json({ error: fileError.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Bilinmeyen işlem." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Sunucu hatası." }, 500);
  }
});