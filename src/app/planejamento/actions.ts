"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function concluirLembrete(formData: FormData) {
  const reminderId = String(formData.get("reminder_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(reminderId)) {
    throw new Error("Lembrete inválido.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { error } = await supabase
    .from("payment_reminders")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", reminderId)
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/planejamento");
  revalidatePath("/");
}
