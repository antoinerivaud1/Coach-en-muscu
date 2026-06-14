"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PROFILE_COOKIE } from "@/lib/profile";

export async function selectProfile(formData: FormData) {
  const id = String(formData.get("profile_id") ?? "").trim();
  if (!id) redirect("/");
  const store = await cookies();
  store.set(PROFILE_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function clearProfile() {
  const store = await cookies();
  store.delete(PROFILE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}
