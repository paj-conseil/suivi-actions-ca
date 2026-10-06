// Gestion des utilisateurs réservée aux administrateurs.
// Actions : create, update, reset_password, delete
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function genPassword(): string {
  // 12 caractères lisibles (sans 0/O/l/1) + un chiffre et un symbole
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let p = "";
  for (const b of bytes) p += alphabet[b % alphabet.length];
  const digits = "23456789";
  const d = digits[crypto.getRandomValues(new Uint8Array(1))[0] % digits.length];
  return `${p.slice(0, 5)}-${p.slice(5)}${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Identifier l'appelant
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);

  const { data: caller } = await admin
    .from("profiles").select("is_admin, actif").eq("id", userData.user.id).single();
  if (!caller?.is_admin || !caller?.actif) return json({ error: "Réservé aux administrateurs" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const action = body.action as string;

  try {
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const prenom = String(body.prenom ?? "").trim();
      const nom = String(body.nom ?? "").trim();
      const fonction = String(body.fonction ?? "").trim() || null;
      if (!email || !prenom || !nom) return json({ error: "Nom, prénom et email sont obligatoires" }, 400);
      const password = (body.password as string) || genPassword();
      if (password.length < 8) return json({ error: "Mot de passe provisoire trop court (8 caractères min.)" }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { prenom, nom },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message)
          ? "Un compte existe déjà avec cet email" : error.message;
        return json({ error: msg }, 400);
      }
      const { error: pErr } = await admin.from("profiles").insert({
        id: data.user.id, email, prenom, nom, fonction,
        is_admin: !!body.is_admin, is_bureau: !!body.is_bureau, is_ca: !!body.is_ca, is_associations: !!body.is_associations,
        must_change_password: true, actif: true,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(data.user.id);
        return json({ error: pErr.message }, 400);
      }
      return json({ id: data.user.id, password });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "Identifiant manquant" }, 400);
      if (id === userData.user.id && (body.is_admin === false || body.actif === false)) {
        return json({ error: "Vous ne pouvez pas retirer vos propres droits d'administrateur" }, 400);
      }
      const patch: Record<string, unknown> = {};
      for (const k of ["prenom", "nom", "fonction", "is_admin", "is_bureau", "is_ca", "is_associations", "actif"]) {
        if (k in body) patch[k] = typeof body[k] === "string" ? ((body[k] as string).trim() || (k === "fonction" ? null : "")) : body[k];
      }
      if (body.email) {
        const email = String(body.email).trim().toLowerCase();
        const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        patch.email = email;
      }
      if (body.actif === false) {
        await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      } else if (body.actif === true) {
        await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const id = String(body.id ?? "");
      const password = (body.password as string) || genPassword();
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
      return json({ ok: true, password });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      if (id === userData.user.id) return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
