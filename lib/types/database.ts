export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      couple_members: {
        Row: {
          couple_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          couple_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          couple_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "couple_members_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couple_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          created_at: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          couple_id: string | null
          created_at: string
          id: string
          is_compound: boolean
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          id?: string
          is_compound?: boolean
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          id?: string
          is_compound?: boolean
          muscle_group?: Database["public"]["Enums"]["muscle_group"]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          color_role: Database["public"]["Enums"]["color_role"]
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          color_role?: Database["public"]["Enums"]["color_role"]
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          color_role?: Database["public"]["Enums"]["color_role"]
          created_at?: string
          display_name?: string
          id?: string
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
          },
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
          },
        ]
      }
      programs: {
        Row: {
          couple_id: string | null
          created_at: string
          id: string
          name: string
          owner_profile_id: string | null
        }
        Insert: {
          couple_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_profile_id?: string | null
        }
        Update: {
          couple_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          },
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
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accessible_profile_ids: { Args: Record<PropertyKey, never>; Returns: string[] }
      create_couple: { Args: { couple_name?: string }; Returns: string }
      join_couple: { Args: { target_couple_id: string }; Returns: string }
      user_couple_id: { Args: Record<PropertyKey, never>; Returns: string }
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
