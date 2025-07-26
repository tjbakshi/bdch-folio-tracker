export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      bdc_universe: {
        Row: {
          cik: string | null
          company_name: string
          created_at: string
          fiscal_year_end: string | null
          fiscal_year_end_day: number | null
          fiscal_year_end_month: number | null
          id: string
          is_active: boolean
          ticker: string
          updated_at: string
        }
        Insert: {
          cik?: string | null
          company_name: string
          created_at?: string
          fiscal_year_end?: string | null
          fiscal_year_end_day?: number | null
          fiscal_year_end_month?: number | null
          id?: string
          is_active?: boolean
          ticker: string
          updated_at?: string
        }
        Update: {
          cik?: string | null
          company_name?: string
          created_at?: string
          fiscal_year_end?: string | null
          fiscal_year_end_day?: number | null
          fiscal_year_end_month?: number | null
          id?: string
          is_active?: boolean
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      filings: {
        Row: {
          accession_number: string
          cik: string
          created_at: string
          document_url: string | null
          error_message: string | null
          filing_date: string
          filing_type: string
          id: string
          period_end_date: string | null
          status: string
          ticker: string
          updated_at: string
        }
        Insert: {
          accession_number: string
          cik: string
          created_at?: string
          document_url?: string | null
          error_message?: string | null
          filing_date: string
          filing_type: string
          id?: string
          period_end_date?: string | null
          status?: string
          ticker: string
          updated_at?: string
        }
        Update: {
          accession_number?: string
          cik?: string
          created_at?: string
          document_url?: string | null
          error_message?: string | null
          filing_date?: string
          filing_type?: string
          id?: string
          period_end_date?: string | null
          status?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      investments_computed: {
        Row: {
          created_at: string
          filing_id: string
          id: string
          is_non_accrual: boolean
          mark: number | null
          quarter_year: string
          raw_investment_id: string
        }
        Insert: {
          created_at?: string
          filing_id: string
          id?: string
          is_non_accrual?: boolean
          mark?: number | null
          quarter_year: string
          raw_investment_id: string
        }
        Update: {
          created_at?: string
          filing_id?: string
          id?: string
          is_non_accrual?: boolean
          mark?: number | null
          quarter_year?: string
          raw_investment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_computed_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_computed_raw_investment_id_fkey"
            columns: ["raw_investment_id"]
            isOneToOne: false
            referencedRelation: "investments_raw"
            referencedColumns: ["id"]
          },
        ]
      }
      investments_raw: {
        Row: {
          acquisition_date: string | null
          amortized_cost: number | null
          business_description: string | null
          company_name: string | null
          coupon: string | null
          created_at: string
          fair_value: number | null
          filing_id: string
          id: string
          investment_tranche: string | null
          principal_amount: number | null
          raw_row_data: Json | null
          reference_rate: string | null
          spread: string | null
        }
        Insert: {
          acquisition_date?: string | null
          amortized_cost?: number | null
          business_description?: string | null
          company_name?: string | null
          coupon?: string | null
          created_at?: string
          fair_value?: number | null
          filing_id: string
          id?: string
          investment_tranche?: string | null
          principal_amount?: number | null
          raw_row_data?: Json | null
          reference_rate?: string | null
          spread?: string | null
        }
        Update: {
          acquisition_date?: string | null
          amortized_cost?: number | null
          business_description?: string | null
          company_name?: string | null
          coupon?: string | null
          created_at?: string
          fair_value?: number | null
          filing_id?: string
          id?: string
          investment_tranche?: string | null
          principal_amount?: number | null
          raw_row_data?: Json | null
          reference_rate?: string | null
          spread?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_raw_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_logs: {
        Row: {
          created_at: string
          details: Json | null
          filing_id: string | null
          id: string
          log_level: string
          message: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          filing_id?: string | null
          id?: string
          log_level: string
          message: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          filing_id?: string | null
          id?: string
          log_level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_logs_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          last_run_at: string | null
          next_run_at: string | null
          scheduled_date: string
          status: string
          ticker: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_type: string
          last_run_at?: string | null
          next_run_at?: string | null
          scheduled_date: string
          status?: string
          ticker: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          last_run_at?: string | null
          next_run_at?: string | null
          scheduled_date?: string
          status?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_filing_dates: {
        Args: { fye_date: string } | { fye_month: number; fye_day: number }
        Returns: {
          filing_type: string
          quarter_end: string
          due_date: string
        }[]
      }
      check_new_filings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
