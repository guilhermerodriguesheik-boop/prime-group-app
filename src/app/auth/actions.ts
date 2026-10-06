"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function message(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function login(formData: FormData) {
  const email = message(formData.get("email"));
  const password = message(formData.get("password"));

  if (!email || !password) {
    redirect("/login?error=Informe%20email%20e%20senha");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

export async function signup(formData: FormData) {
  const email = message(formData.get("email"));
  const password = message(formData.get("password"));
  const fullName = message(formData.get("full_name"));

  if (!email || password.length < 8) {
    redirect("/login?error=Use%20um%20email%20válido%20e%20senha%20com%20ao%20menos%208%20caracteres");
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: siteUrl + "/auth/callback",
    },
  });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  if (data.session) {
    redirect("/");
  }

  redirect("/login?message=Confira%20seu%20email%20para%20confirmar%20a%20conta");
}
