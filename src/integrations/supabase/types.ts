export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      agent_feedback: {
        Row: {
          acknowledged: boolean
          agent_id: string
          call_log_id: string | null
          campaign_id: string | null
          created_at: string
          feedback_by: string
          feedback_type: string
          id: string
          message: string
        }
        Insert: {
          acknowledged?: boolean
          agent_id: string
          call_log_id?: string | null
          campaign_id?: string | null
          created_at?: string
          feedback_by: string
          feedback_type?: string
          id?: string
          message: string
        }
        Update: {
          acknowledged?: boolean
          agent_id?: string
          call_log_id?: string | null
          campaign_id?: string | null
          created_at?: string
          feedback_by?: string
          feedback_type?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      ai_call_summaries: {
        Row: {
          agent_id: string | null
          call_log_id: string
          call_outcome_summary: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          error_message: string | null
          generation_status: string
          id: string
          next_action: string | null
          sentiment: string | null
          suggested_next_action: string | null
          summary: string
          summary_source: string
        }
        Insert: {
          agent_id?: string | null
          call_log_id: string
          call_outcome_summary?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          generation_status?: string
          id?: string
          next_action?: string | null
          sentiment?: string | null
          suggested_next_action?: string | null
          summary?: string
          summary_source?: string
        }
        Update: {
          agent_id?: string | null
          call_log_id?: string
          call_outcome_summary?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          generation_status?: string
          id?: string
          next_action?: string | null
          sentiment?: string | null
          suggested_next_action?: string | null
          summary?: string
          summary_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_summaries_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          address: string | null
          agent_id: string | null
          appointment_at: string
          campaign_id: string | null
          city: string | null
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          state: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          agent_id?: string | null
          appointment_at: string
          campaign_id?: string | null
          city?: string | null
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          agent_id?: string | null
          appointment_at?: string
          campaign_id?: string | null
          city?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contact_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_id: string | null
          call_source: string
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          dial_mode_used: string | null
          disposition: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          manual_dialed_e164: string | null
          manual_dialed_number: string | null
          notes: string | null
          outbound_number_used: string | null
          provider_used: string | null
          recording_id: string | null
          started_at: string | null
          telnyx_call_id: string | null
        }
        Insert: {
          agent_id?: string | null
          call_source?: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          dial_mode_used?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          manual_dialed_e164?: string | null
          manual_dialed_number?: string | null
          notes?: string | null
          outbound_number_used?: string | null
          provider_used?: string | null
          recording_id?: string | null
          started_at?: string | null
          telnyx_call_id?: string | null
        }
        Update: {
          agent_id?: string | null
          call_source?: string
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          dial_mode_used?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          manual_dialed_e164?: string | null
          manual_dialed_number?: string | null
          notes?: string | null
          outbound_number_used?: string | null
          provider_used?: string | null
          recording_id?: string | null
          started_at?: string | null
          telnyx_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contact_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_monitoring_sessions: {
        Row: {
          agent_id: string
          call_log_id: string
          campaign_id: string | null
          created_at: string
          ended_at: string | null
          failure_reason: string | null
          id: string
          monitoring_mode: string
          provider_call_id: string | null
          provider_conference_id: string | null
          provider_type: string
          started_at: string
          status: string
          supervisor_id: string
        }
        Insert: {
          agent_id: string
          call_log_id: string
          campaign_id?: string | null
          created_at?: string
          ended_at?: string | null
          failure_reason?: string | null
          id?: string
          monitoring_mode: string
          provider_call_id?: string | null
          provider_conference_id?: string | null
          provider_type?: string
          started_at?: string
          status?: string
          supervisor_id: string
        }
        Update: {
          agent_id?: string
          call_log_id?: string
          campaign_id?: string | null
          created_at?: string
          ended_at?: string | null
          failure_reason?: string | null
          id?: string
          monitoring_mode?: string
          provider_call_id?: string | null
          provider_conference_id?: string | null
          provider_type?: string
          started_at?: string
          status?: string
          supervisor_id?: string
        }
        Relationships: []
      }
      callbacks: {
        Row: {
          agent_id: string | null
          callback_at: string
          campaign_id: string | null
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          priority: number | null
          status: Database["public"]["Enums"]["callback_status"] | null
        }
        Insert: {
          agent_id?: string | null
          callback_at: string
          campaign_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: number | null
          status?: Database["public"]["Enums"]["callback_status"] | null
        }
        Update: {
          agent_id?: string | null
          callback_at?: string
          campaign_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: number | null
          status?: Database["public"]["Enums"]["callback_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "callbacks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contact_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_agents: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_agents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          assigned_agent_id: string | null
          attempts: number | null
          callback_at: string | null
          campaign_id: string
          contact_id: string
          created_at: string
          dial_status: Database["public"]["Enums"]["dial_status"] | null
          id: string
          last_called_at: string | null
          next_eligible_at: string | null
          priority_band: Database["public"]["Enums"]["priority_band"]
          priority_score: number | null
          score_reason: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          attempts?: number | null
          callback_at?: string | null
          campaign_id: string
          contact_id: string
          created_at?: string
          dial_status?: Database["public"]["Enums"]["dial_status"] | null
          id?: string
          last_called_at?: string | null
          next_eligible_at?: string | null
          priority_band?: Database["public"]["Enums"]["priority_band"]
          priority_score?: number | null
          score_reason?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          attempts?: number | null
          callback_at?: string | null
          campaign_id?: string
          contact_id?: string
          created_at?: string
          dial_status?: Database["public"]["Enums"]["dial_status"] | null
          id?: string
          last_called_at?: string | null
          next_eligible_at?: string | null
          priority_band?: Database["public"]["Enums"]["priority_band"]
          priority_score?: number | null
          score_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contact_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_phone_numbers: {
        Row: {
          area_code: string | null
          campaign_id: string
          cooldown_minutes: number
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          max_calls_per_day: number
          max_calls_per_hour: number
          phone_number: string
          priority: number
          provider: string
          rotation_order: number
        }
        Insert: {
          area_code?: string | null
          campaign_id: string
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_calls_per_day?: number
          max_calls_per_hour?: number
          phone_number: string
          priority?: number
          provider?: string
          rotation_order?: number
        }
        Update: {
          area_code?: string | null
          campaign_id?: string
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_calls_per_day?: number
          max_calls_per_hour?: number
          phone_number?: string
          priority?: number
          provider?: string
          rotation_order?: number
        }
        Relationships: []
      }
      campaign_scripts: {
        Row: {
          body: string
          campaign_id: string
          created_at: string
          id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          campaign_id: string
          created_at?: string
          id?: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          client_account_id: string | null
          created_at: string
          created_by: string | null
          dial_mode: string | null
          id: string
          local_presence_enabled: boolean
          max_attempts: number | null
          max_concurrent_agents: number | null
          min_wait_seconds: number | null
          name: string
          queue_strategy: string | null
          retry_delay_no_answer: number | null
          retry_delay_voicemail: number | null
          rotation_strategy: string
          status: Database["public"]["Enums"]["campaign_status"] | null
          telephony_provider_id: string | null
          updated_at: string
          wrap_up_seconds: number | null
        }
        Insert: {
          client_account_id?: string | null
          created_at?: string
          created_by?: string | null
          dial_mode?: string | null
          id?: string
          local_presence_enabled?: boolean
          max_attempts?: number | null
          max_concurrent_agents?: number | null
          min_wait_seconds?: number | null
          name: string
          queue_strategy?: string | null
          retry_delay_no_answer?: number | null
          retry_delay_voicemail?: number | null
          rotation_strategy?: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          telephony_provider_id?: string | null
          updated_at?: string
          wrap_up_seconds?: number | null
        }
        Update: {
          client_account_id?: string | null
          created_at?: string
          created_by?: string | null
          dial_mode?: string | null
          id?: string
          local_presence_enabled?: boolean
          max_attempts?: number | null
          max_concurrent_agents?: number | null
          min_wait_seconds?: number | null
          name?: string
          queue_strategy?: string | null
          retry_delay_no_answer?: number | null
          retry_delay_voicemail?: number | null
          rotation_strategy?: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          telephony_provider_id?: string | null
          updated_at?: string
          wrap_up_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_telephony_provider_id_fkey"
            columns: ["telephony_provider_id"]
            isOneToOne: false
            referencedRelation: "telephony_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_telephony_provider_id_fkey"
            columns: ["telephony_provider_id"]
            isOneToOne: false
            referencedRelation: "telephony_providers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      client_users: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          city: string | null
          cool_notes: string | null
          county: string | null
          created_at: string
          credit_rating: string | null
          first_name: string
          home_value: string | null
          household_income: string | null
          id: string
          import_job_id: string | null
          last_name: string
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          owner_renter: string | null
          phone_e164: string | null
          phone_raw: string | null
          state: string | null
          timezone: string | null
          title: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cool_notes?: string | null
          county?: string | null
          created_at?: string
          credit_rating?: string | null
          first_name: string
          home_value?: string | null
          household_income?: string | null
          id?: string
          import_job_id?: string | null
          last_name: string
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          state?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cool_notes?: string | null
          county?: string | null
          created_at?: string
          credit_rating?: string | null
          first_name?: string
          home_value?: string | null
          household_income?: string | null
          id?: string
          import_job_id?: string | null
          last_name?: string
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          state?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      dispositions: {
        Row: {
          active: boolean | null
          code: string
          id: string
          label: string
          requires_appointment_modal: boolean | null
          requires_callback_datetime: boolean | null
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          code: string
          id?: string
          label: string
          requires_appointment_modal?: boolean | null
          requires_callback_datetime?: boolean | null
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          code?: string
          id?: string
          label?: string
          requires_appointment_modal?: boolean | null
          requires_callback_datetime?: boolean | null
          sort_order?: number | null
        }
        Relationships: []
      }
      import_errors: {
        Row: {
          error_message: string | null
          id: string
          import_job_id: string
          raw_payload: Json | null
          row_number: number | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          import_job_id: string
          raw_payload?: Json | null
          row_number?: number | null
        }
        Update: {
          error_message?: string | null
          id?: string
          import_job_id?: string
          raw_payload?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          campaign_id: string | null
          column_mapping: Json | null
          created_at: string
          failed_rows: number | null
          filename: string
          id: string
          processed_rows: number | null
          status: Database["public"]["Enums"]["import_status"] | null
          successful_rows: number | null
          total_rows: number | null
          uploaded_by: string | null
        }
        Insert: {
          campaign_id?: string | null
          column_mapping?: Json | null
          created_at?: string
          failed_rows?: number | null
          filename: string
          id?: string
          processed_rows?: number | null
          status?: Database["public"]["Enums"]["import_status"] | null
          successful_rows?: number | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Update: {
          campaign_id?: string | null
          column_mapping?: Json | null
          created_at?: string
          failed_rows?: number | null
          filename?: string
          id?: string
          processed_rows?: number | null
          status?: Database["public"]["Enums"]["import_status"] | null
          successful_rows?: number | null
          total_rows?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_number_stats: {
        Row: {
          answer_rate: number | null
          answered_calls: number
          appointment_rate: number | null
          appointments: number
          calls_last_hour: number
          calls_today: number
          cooldown_until: string | null
          health_status: Database["public"]["Enums"]["number_health_status"]
          id: string
          last_reset_date: string
          phone_number_id: string
          total_calls: number
          updated_at: string
        }
        Insert: {
          answer_rate?: number | null
          answered_calls?: number
          appointment_rate?: number | null
          appointments?: number
          calls_last_hour?: number
          calls_today?: number
          cooldown_until?: string | null
          health_status?: Database["public"]["Enums"]["number_health_status"]
          id?: string
          last_reset_date?: string
          phone_number_id: string
          total_calls?: number
          updated_at?: string
        }
        Update: {
          answer_rate?: number | null
          answered_calls?: number
          appointment_rate?: number | null
          appointments?: number
          calls_last_hour?: number
          calls_today?: number
          cooldown_until?: string | null
          health_status?: Database["public"]["Enums"]["number_health_status"]
          id?: string
          last_reset_date?: string
          phone_number_id?: string
          total_calls?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_number_stats_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: true
            referencedRelation: "campaign_phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_status: Database["public"]["Enums"]["agent_status"] | null
          avatar_url: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          status_reason: string | null
          status_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_status?: Database["public"]["Enums"]["agent_status"] | null
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          status_reason?: string | null
          status_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_status?: Database["public"]["Enums"]["agent_status"] | null
          avatar_url?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          status_reason?: string | null
          status_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_scores: {
        Row: {
          agent_id: string
          call_log_id: string
          campaign_id: string | null
          closing_score: number
          communication_score: number
          compliance_score: number
          created_at: string
          id: string
          improvement_feedback: string | null
          notes: string | null
          objection_handling_score: number
          opening_score: number
          qualification_score: number
          scored_by: string
          script_adherence_score: number
          strengths: string | null
          total_score: number | null
        }
        Insert: {
          agent_id: string
          call_log_id: string
          campaign_id?: string | null
          closing_score?: number
          communication_score?: number
          compliance_score?: number
          created_at?: string
          id?: string
          improvement_feedback?: string | null
          notes?: string | null
          objection_handling_score?: number
          opening_score?: number
          qualification_score?: number
          scored_by: string
          script_adherence_score?: number
          strengths?: string | null
          total_score?: number | null
        }
        Update: {
          agent_id?: string
          call_log_id?: string
          campaign_id?: string | null
          closing_score?: number
          communication_score?: number
          compliance_score?: number
          created_at?: string
          id?: string
          improvement_feedback?: string | null
          notes?: string | null
          objection_handling_score?: number
          opening_score?: number
          qualification_score?: number
          scored_by?: string
          script_adherence_score?: number
          strengths?: string | null
          total_score?: number | null
        }
        Relationships: []
      }
      recording_transcripts: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          language: string | null
          recording_id: string
          source: string
          status: string
          transcript_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          recording_id: string
          source?: string
          status?: string
          transcript_text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          recording_id?: string
          source?: string
          status?: string
          transcript_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          call_log_id: string | null
          created_at: string
          duration_seconds: number | null
          format: string | null
          id: string
          recording_url: string | null
          telnyx_recording_id: string | null
        }
        Insert: {
          call_log_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          format?: string | null
          id?: string
          recording_url?: string | null
          telnyx_recording_id?: string | null
        }
        Update: {
          call_log_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          format?: string | null
          id?: string
          recording_url?: string | null
          telnyx_recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_providers: {
        Row: {
          created_at: string
          default_outbound_number: string | null
          id: string
          is_active: boolean
          name: string
          private_config: Json | null
          provider_type: string
          public_config: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_outbound_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          private_config?: Json | null
          provider_type?: string
          public_config?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_outbound_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          private_config?: Json | null
          provider_type?: string
          public_config?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      client_contact_view: {
        Row: {
          address: string | null
          city: string | null
          county: string | null
          created_at: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          owner_renter: string | null
          phone_e164: string | null
          phone_raw: string | null
          state: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          county?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          state?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          county?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          state?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      telephony_providers_safe: {
        Row: {
          created_at: string | null
          default_outbound_number: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          provider_type: string | null
          public_config: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_outbound_number?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider_type?: string | null
          public_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_outbound_number?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider_type?: string | null
          public_config?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_client_account_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agent_on_campaign: {
        Args: { _campaign_id: string; _user_id: string }
        Returns: boolean
      }
      release_stale_dialing_locks: { Args: never; Returns: number }
    }
    Enums: {
      agent_status:
        | "available"
        | "on_call"
        | "wrap_up"
        | "paused"
        | "offline"
        | "ready"
        | "lunch"
        | "tea"
        | "bathroom_break"
      app_role: "admin" | "manager" | "agent" | "client" | "team_leader"
      appointment_status:
        | "booked"
        | "confirmed"
        | "rescheduled"
        | "completed"
        | "no_show"
        | "replaced"
      callback_status: "pending" | "completed" | "missed" | "cancelled"
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      dial_status: "pending" | "dialing" | "completed" | "skipped" | "failed"
      import_status:
        | "uploading"
        | "mapping"
        | "processing"
        | "completed"
        | "failed"
      lead_status: "new" | "contacted" | "qualified" | "converted" | "dead"
      number_health_status:
        | "healthy"
        | "warm"
        | "fatigued"
        | "cooling_down"
        | "blocked"
      priority_band: "hot" | "warm" | "medium" | "low" | "excluded"
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
    Enums: {
      agent_status: [
        "available",
        "on_call",
        "wrap_up",
        "paused",
        "offline",
        "ready",
        "lunch",
        "tea",
        "bathroom_break",
      ],
      app_role: ["admin", "manager", "agent", "client", "team_leader"],
      appointment_status: [
        "booked",
        "confirmed",
        "rescheduled",
        "completed",
        "no_show",
        "replaced",
      ],
      callback_status: ["pending", "completed", "missed", "cancelled"],
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      dial_status: ["pending", "dialing", "completed", "skipped", "failed"],
      import_status: [
        "uploading",
        "mapping",
        "processing",
        "completed",
        "failed",
      ],
      lead_status: ["new", "contacted", "qualified", "converted", "dead"],
      number_health_status: [
        "healthy",
        "warm",
        "fatigued",
        "cooling_down",
        "blocked",
      ],
      priority_band: ["hot", "warm", "medium", "low", "excluded"],
    },
  },
} as const
