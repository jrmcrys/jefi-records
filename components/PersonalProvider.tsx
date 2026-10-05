"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Personal } from "@/lib/personal";

export type Branding = { logoUrl: string | null };

type Ctx = {
  me: string;
  personal: Personal;
  /** Merge a change into this person's settings and save it. */
  update: (fn: (p: Personal) => Personal) => Promise<string | null>;
  branding: Branding;
  setLogo: (url: string | null) => Promise<string | null>;
};

const PersonalContext = createContext<Ctx | null>(null);

export function PersonalProvider({
  me,
  initial,
  initialBranding,
  children,
}: {
  me: string;
  initial: Personal;
  initialBranding: Branding;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [personal, setPersonal] = useState<Personal>(initial);
  const [branding, setBranding] = useState<Branding>(initialBranding);

  const update = useCallback(
    async (fn: (p: Personal) => Personal) => {
      const next = fn(personal);
      const previous = personal;
      setPersonal(next);
      const { error } = await supabase
        .from("profiles")
        .update({ personal: next })
        .eq("id", me);
      if (error) {
        setPersonal(previous);
        return error.message;
      }
      return null;
    },
    [personal, supabase, me]
  );

  const setLogo = useCallback(
    async (url: string | null) => {
      const previous = branding;
      setBranding({ logoUrl: url });
      const { error } = await supabase
        .from("app_settings")
        .update({ logo_url: url, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) {
        setBranding(previous);
        return error.message;
      }
      return null;
    },
    [branding, supabase]
  );

  const value = useMemo(
    () => ({ me, personal, update, branding, setLogo }),
    [me, personal, update, branding, setLogo]
  );

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export function usePersonal(): Ctx {
  const ctx = useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal must be used inside PersonalProvider");
  return ctx;
}
