
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  attendance: {
    Tables: {
      attendances: {
        Row: {
          card_id: string
          created_at: string
          date: string
          id: string
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          date?: string
          id?: string
          timestamp?: string
          type: string
          user_id: string
        }
        Update: {
          card_id?: string
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
            referencedColumns: ["supabase_auth_user_id"]
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
      users: {
        Row: {
          card_id: string
          created_at: string
          supabase_auth_user_id: string
          updated_at: string
        }
        Insert: {
          card_id: string
          created_at?: string
          supabase_auth_user_id: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          supabase_auth_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_users_supabase_auth_user_id_fkey"
            columns: ["supabase_auth_user_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["supabase_auth_user_id"]
            referencedSchema: "member"
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_currently_in_user_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_latest_attendance_for_users: {
        Args: {
          user_ids: string[]
        }
        Returns: {
          user_id: string
          type: string
          timestamp: string
        }[]
      }
      get_monthly_attendance_summary: {
        Args: {
          start_date: string
          end_date: string
        }
        Returns: {
          date: string
          team_id: string
          team_name: string
          generation: number
          count: number
        }[]
      }
    }
    Enums: never
    CompositeTypes: never
  }
  member: {
    Tables: {
      generation_roles: {
        Row: {
          discord_role_id: string
          generation: number
        }
        Insert: {
          discord_role_id: string
          generation: number
        }
        Update: {
          discord_role_id?: string
          generation?: number
        }
        Relationships: []
      }
      member_team_relations: {
        Row: {
          created_at: string | null
          member_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          member_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          member_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_team_relations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["supabase_auth_user_id"]
          },
          {
            foreignKeyName: "member_team_relations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar_url: string | null
          deleted_at: string | null
          discord_uid: string
          display_name: string
          generation: number
          is_admin: boolean
          joined_at: string
          status: number
          student_number: string | null
          supabase_auth_user_id: string
        }
        Insert: {
          avatar_url?: string | null
          deleted_at?: string | null
          discord_uid: string
          display_name: string
          generation: number
          is_admin?: boolean
          joined_at?: string
          status: number
          student_number?: string | null
          supabase_auth_user_id: string
        }
        Update: {
          avatar_url?: string | null
          deleted_at?: string | null
          discord_uid?: string
          display_name?: string
          generation?: number
          is_admin?: boolean
          joined_at?: string
          status?: number
          student_number?: string | null
          supabase_auth_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_supabase_auth_user_id"
            columns: ["supabase_auth_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_leaders: {
        Row: {
          member_id: string
          team_id: string
        }
        Insert: {
          member_id: string
          team_id: string
        }
        Update: {
          member_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_leaders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["supabase_auth_user_id"]
          },
          {
            foreignKeyName: "team_leaders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          discord_role_id: string
          id: string
          name: string
        }
        Insert: {
          discord_role_id: string
          id?: string
          name: string
        }
        Update: {
          discord_role_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      users_with_latest_attendance: {
        Row: {
          card_id: string | null
          deleted_at: string | null
          display_name: string | null
          generation: number | null
          id: string | null
          is_admin: boolean | null
          latest_attendance_type: string | null
          latest_timestamp: string | null
          status: number | null
          student_number: string | null
          team_name: string | null
        }
        Insert: {
          card_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          generation?: number | null
          id?: string | null
          is_admin?: boolean | null
          latest_attendance_type?: string | null
          latest_timestamp?: string | null
          status?: number | null
          student_number?: string | null
          team_name?: string | null
        }
        Update: {
          card_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          generation?: number | null
          id?: string | null
          is_admin?: boolean | null
          latest_attendance_type?: string | null
          latest_timestamp?: string | null
          status?: number | null
          student_number?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_supabase_auth_user_id"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users_with_latest_attendance_and_team: {
        Row: {
          card_id: string | null
          deleted_at: string | null
          display_name: string | null
          generation: number | null
          id: string | null
          is_admin: boolean | null
          latest_attendance_type: string | null
          latest_timestamp: string | null
          status: number | null
          student_number: string | null
          team_id: string | null
          team_name: string | null
        }
        Insert: {
          card_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          generation?: number | null
          id?: string | null
          is_admin?: boolean | null
          latest_attendance_type?: string | null
          latest_timestamp?: string | null
          status?: number | null
          student_number?: string | null
          team_id?: string | null
          team_name?: string | null
        }
        Update: {
          card_id?: string | null
          deleted_at?: string | null
          display_name?: string | null
          generation?: number | null
          id?: string | null
          is_admin?: boolean | null
          latest_attendance_type?: string | null
          latest_timestamp?: string | null
          status?: number | null
          student_number?: string | null
          team_id?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_supabase_auth_user_id"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: never
    CompositeTypes: never
  }
}

type PublicSchema = keyof (Database)

export type Tables<
  SchemaName extends PublicSchema,
  TableName extends keyof (Database[SchemaName]["Tables"] &
    Database[SchemaName]["Views"])
> = (Database[SchemaName]["Tables"] &
  Database[SchemaName]["Views"])[TableName] extends {
  Row: infer R
}
  ? R
  : never

export type TablesInsert<
  SchemaName extends PublicSchema,
  TableName extends keyof Database[SchemaName]["Tables"]
> = Database[SchemaName]["Tables"][TableName] extends {
  Insert: infer I
}
  ? I
  : never

export type TablesUpdate<
  SchemaName extends PublicSchema,
  TableName extends keyof Database[SchemaName]["Tables"]
> = Database[SchemaName]["Tables"][TableName] extends {
  Update: infer U
}
  ? U
  : never

export type Enums<
  SchemaName extends PublicSchema,
  EnumName extends keyof Database[SchemaName]["Enums"]
> = Database[SchemaName]["Enums"][EnumName]

    