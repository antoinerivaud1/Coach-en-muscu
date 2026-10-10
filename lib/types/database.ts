export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─────────────────────────────────────────────────────────────────────────────
// PATCHS MANUELS À RÉAPPLIQUER APRÈS CHAQUE REGÉNÉRATION DU TYPEGEN (CM-7)
//
// Ce fichier est généré par le typegen Supabase. Deux points à connaître :
//
// 1. `@supabase/supabase-js` est épinglé EXACTEMENT à `2.55.0` dans
//    package.json (sans caret). Les versions intermédiaires 2.45→2.55 ont un
//    bug d'inférence qui type le 2e argument de `rpc()` comme `undefined`
//    (cf. https://www.answeroverflow.com/m/1409468021931511849). Avant de
//    lever le pin, vérifier que le bug est officiellement corrigé :
//    https://github.com/supabase/supabase-js/issues
//
// 2. CM-85 partie A : bloc `public` régénéré depuis la base locale
//    (`supabase gen types typescript --local` après `supabase db reset`),
//    formaté pour coller au reste du fichier ; `__InternalSupabase` conservé.
//    Le typegen local écrit `Args: Record<PropertyKey, never>` là où celui de
//    la prod écrit `Args: never` : on garde `never`. CM-99 : tables
//    `couples` / `couple_members`, colonnes `couple_id` et fonctions couple
//    retirées à la main (supprimées du schéma). CM-86 socle : colonnes
//    `profiles.accent_color`, `avatar_url`, `onboarded_at` et
//    `exercises.owner_profile_id` (+ sa FK) ajoutées à la main, au format du
//    typegen (migration 20261010180000_cm86_socle_profil.sql).
// ─────────────────────────────────────────────────────────────────────────────

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      duo_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          created_by: string
          duo_id: string
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          created_by: string
          duo_id: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          created_by?: string
          duo_id?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "duo_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duo_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duo_invitations_duo_id_fkey"
            columns: ["duo_id"]
            isOneToOne: false
            referencedRelation: "duos"
            referencedColumns: ["id"]
          }
        ]
      }
      duo_members: {
        Row: {
          duo_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          duo_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          duo_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duo_members_duo_id_fkey"
            columns: ["duo_id"]
            isOneToOne: false
            referencedRelation: "duos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duo_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      duos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      exercises: {
        Row: {
          created_at: string
          duo_id: string | null
          id: string
          is_compound: boolean
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          owner_profile_id: string | null
        }
        Insert: {
          created_at?: string
          duo_id?: string | null
          id?: string
          is_compound?: boolean
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          owner_profile_id?: string | null
        }
        Update: {
          created_at?: string
          duo_id?: string | null
          id?: string
          is_compound?: boolean
          muscle_group?: Database["public"]["Enums"]["muscle_group"]
          name?: string
          owner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_duo_id_fkey"
            columns: ["duo_id"]
            isOneToOne: false
            referencedRelation: "duos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          accent_color: string
          avatar_url: string | null
          color_role: Database["public"]["Enums"]["color_role"]
          created_at: string
          display_name: string
          id: string
          onboarded_at: string | null
          weekly_goal: number
        }
        Insert: {
          accent_color?: string
          avatar_url?: string | null
          color_role?: Database["public"]["Enums"]["color_role"]
          created_at?: string
          display_name: string
          id: string
          onboarded_at?: string | null
          weekly_goal?: number
        }
        Update: {
          accent_color?: string
          avatar_url?: string | null
          color_role?: Database["public"]["Enums"]["color_role"]
          created_at?: string
          display_name?: string
          id?: string
          onboarded_at?: string | null
          weekly_goal?: number
        }
        Relationships: []
      }
      program_days: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          program_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          program_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          }
        ]
      }
      program_exercises: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          program_day_id: string
          rest_seconds: number
          target_reps_max: number
          target_reps_min: number
          target_sets: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number
          program_day_id: string
          rest_seconds?: number
          target_reps_max?: number
          target_reps_min?: number
          target_sets?: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          program_day_id?: string
          rest_seconds?: number
          target_reps_max?: number
          target_reps_min?: number
          target_sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          }
        ]
      }
      programs: {
        Row: {
          created_at: string
          duo_id: string | null
          id: string
          name: string
          owner_profile_id: string | null
        }
        Insert: {
          created_at?: string
          duo_id?: string | null
          id?: string
          name: string
          owner_profile_id?: string | null
        }
        Update: {
          created_at?: string
          duo_id?: string | null
          id?: string
          name?: string
          owner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_duo_id_fkey"
            columns: ["duo_id"]
            isOneToOne: false
            referencedRelation: "duos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      session_sets: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          is_warmup: boolean
          reps: number
          rpe: number | null
          session_id: string
          set_index: number
          weight_kg: number
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          is_warmup?: boolean
          reps: number
          rpe?: number | null
          session_id: string
          set_index: number
          weight_kg: number
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          is_warmup?: boolean
          reps?: number
          rpe?: number | null
          session_id?: string
          set_index?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
      sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          feedback: Database["public"]["Enums"]["session_feedback"] | null
          id: string
          notes: string | null
          performed_at: string
          profile_id: string
          program_day_id: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          feedback?: Database["public"]["Enums"]["session_feedback"] | null
          id?: string
          notes?: string | null
          performed_at?: string
          profile_id: string
          program_day_id?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          feedback?: Database["public"]["Enums"]["session_feedback"] | null
          id?: string
          notes?: string | null
          performed_at?: string
          profile_id?: string
          program_day_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // CM-87 : RPC du duo optionnel (supabase/migrations/20261010191000_cm87_duo_rpc.sql).
      accept_duo_invitation: {
        Args: { p_code: string; p_accent_color?: string | null }
        Returns: string
      }
      create_duo_invitation: {
        Args: never
        Returns: { code: string; token: string; expires_at: string }[]
      }
      get_duo_invitation: {
        Args: { p_code: string }
        Returns: {
          inviter_name: string
          inviter_color: string
          expires_at: string
          my_color: string
          color_conflict: boolean
          already_in_duo: boolean
        }[]
      }
      get_my_duo_invitation: {
        Args: never
        Returns: { code: string; token: string; expires_at: string }[]
      }
      leave_duo: { Args: never; Returns: undefined }
      revoke_duo_invitation: { Args: never; Returns: undefined }
      set_seance_shared: {
        Args: { p_day_id: string; p_shared: boolean }
        Returns: { status: "moved" | "copied" | "unchanged"; day_id: string }[]
      }
      can_access_program: { Args: { p_program_id: string }; Returns: boolean }
      is_duo_member: { Args: { p_duo_id: string }; Returns: boolean }
      my_duo_id: { Args: never; Returns: string }
      visible_profile_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      color_role: "toi" | "elle"
      muscle_group:
        | "chest"
        | "back"
        | "shoulders"
        | "biceps"
        | "triceps"
        | "quads"
        | "hamstrings"
        | "glutes"
        | "calves"
        | "core"
        | "other"
      session_feedback: "easy" | "normal" | "hard" | "failure"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? CompositeTypeName extends keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : never
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      color_role: ["toi", "elle"],
      muscle_group: [
        "chest",
        "back",
        "shoulders",
        "biceps",
        "triceps",
        "quads",
        "hamstrings",
        "glutes",
        "calves",
        "core",
        "other",
      ],
      session_feedback: ["easy", "normal", "hard", "failure"],
    },
  },
} as const
