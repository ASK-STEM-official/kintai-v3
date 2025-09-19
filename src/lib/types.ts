export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      announcements: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          is_current: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          created_at: string
          date: string
          id: string
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          timestamp?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          timestamp?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logout_logs: {
        Row: {
          affected_count: number
          executed_at: string
          id: string
          status: string
        }
        Insert: {
          affected_count: number
          executed_at?: string
          id?: string
          status: string
        }
        Update: {
          affected_count?: number
          executed_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      temp_registrations: {
        Row: {
          accessed_at: string | null
          card_id: string
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          qr_token: string
        }
        Insert: {
          accessed_at?: string | null
          card_id: string
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          qr_token: string
        }
        Update: {
          accessed_at?: string | null
          card_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          qr_token?: string
        }
        Relationships: []
      }
      user_edit_logs: {
        Row: {
          created_at: string
          editor_user_id: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          target_user_id: string
        }
        Insert: {
          created_at?: string
          editor_user_id?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id: string
        }
        Update: {
          created_at?: string
          editor_user_id?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_edit_logs_editor_user_id_fkey"
            columns: ["editor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_edit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          card_id: string
          created_at: string
          discord_id: string
          display_name: string
          generation: number
          id: string
          is_active: boolean
          role: number
          team_id: number | null
          updated_at: string
        }
        Insert: {
          card_id: string
          created_at?: string
          discord_id: string
          display_name: string
          generation: number
          id: string
          is_active?: boolean
          role?: number
          team_id?: number | null
          updated_at?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          discord_id?: string
          display_name?: string
          generation?: number
          id?: string
          is_active?: boolean
          role?: number
          team_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_team_stats: {
        Row: {
          attendance_count: number | null
          date: string | null
          generation: number | null
          team_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: never
    CompositeTypes: never
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
