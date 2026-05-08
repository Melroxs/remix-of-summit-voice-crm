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
      agent_telephony_credentials: {
        Row: {
          active: boolean
          agent_id: string
          connection_id: string | null
          created_at: string
          encrypted_telnyx_sip_password: string | null
          id: string
          outbound_voice_profile_id: string | null
          telnyx_credential_id: string | null
          telnyx_sip_username: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_id: string
          connection_id?: string | null
          created_at?: string
          encrypted_telnyx_sip_password?: string | null
          id?: string
          outbound_voice_profile_id?: string | null
          telnyx_credential_id?: string | null
          telnyx_sip_username?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_id?: string
          connection_id?: string | null
          created_at?: string
          encrypted_telnyx_sip_password?: string | null
          id?: string
          outbound_voice_profile_id?: string | null
          telnyx_credential_id?: string | null
          telnyx_sip_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_summaries: {
        Row: {
          agent_id: string | null
          call_attempt_id: string
          call_outcome_summary: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          error_message: string | null
          generation_status: string
          id: string
          lead_quality_score: number | null
          next_action: string | null
          next_step_recommendation: string | null
          objections: Json
          quality_score: number | null
          recommended_action: string | null
          sentiment: string | null
          suggested_next_action: string | null
          summary: string
          summary_source: string
        }
        Insert: {
          agent_id?: string | null
          call_attempt_id: string
          call_outcome_summary?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          generation_status?: string
          id?: string
          lead_quality_score?: number | null
          next_action?: string | null
          next_step_recommendation?: string | null
          objections?: Json
          quality_score?: number | null
          recommended_action?: string | null
          sentiment?: string | null
          suggested_next_action?: string | null
          summary?: string
          summary_source?: string
        }
        Update: {
          agent_id?: string | null
          call_attempt_id?: string
          call_outcome_summary?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          error_message?: string | null
          generation_status?: string
          id?: string
          lead_quality_score?: number | null
          next_action?: string | null
          next_step_recommendation?: string | null
          objections?: Json
          quality_score?: number | null
          recommended_action?: string | null
          sentiment?: string | null
          suggested_next_action?: string | null
          summary?: string
          summary_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_summaries_call_log_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_materials: {
        Row: {
          campaign_id: string | null
          company_id: string
          content: string
          created_at: string
          created_by: string | null
          difficulty: string | null
          id: string
          is_active: boolean
          material_type: Database["public"]["Enums"]["training_material_type"]
          parent_id: string | null
          scenario: string | null
          sort_order: number
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          content?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          id?: string
          is_active?: boolean
          material_type: Database["public"]["Enums"]["training_material_type"]
          parent_id?: string | null
          scenario?: string | null
          sort_order?: number
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string | null
          id?: string
          is_active?: boolean
          material_type?: Database["public"]["Enums"]["training_material_type"]
          parent_id?: string | null
          scenario?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_materials_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ai_training_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          address: string | null
          agent_id: string | null
          appointment_at: string
          appointment_type: Database["public"]["Enums"]["appointment_type"]
          booked_from_call_id: string | null
          campaign_id: string | null
          city: string | null
          closer_user_id: string | null
          contact_id: string
          contact_phone_id: string | null
          created_at: string
          handoff_notes: string | null
          id: string
          job_type: string | null
          notes: string | null
          state: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          timezone: string | null
          urgency: Database["public"]["Enums"]["urgency_level"]
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          agent_id?: string | null
          appointment_at: string
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          booked_from_call_id?: string | null
          campaign_id?: string | null
          city?: string | null
          closer_user_id?: string | null
          contact_id: string
          contact_phone_id?: string | null
          created_at?: string
          handoff_notes?: string | null
          id?: string
          job_type?: string | null
          notes?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          timezone?: string | null
          urgency?: Database["public"]["Enums"]["urgency_level"]
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          agent_id?: string | null
          appointment_at?: string
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          booked_from_call_id?: string | null
          campaign_id?: string | null
          city?: string | null
          closer_user_id?: string | null
          contact_id?: string
          contact_phone_id?: string | null
          created_at?: string
          handoff_notes?: string | null
          id?: string
          job_type?: string | null
          notes?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          timezone?: string | null
          urgency?: Database["public"]["Enums"]["urgency_level"]
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
          {
            foreignKeyName: "appointments_contact_phone_id_fkey"
            columns: ["contact_phone_id"]
            isOneToOne: false
            referencedRelation: "contact_phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      area_code_map: {
        Row: {
          area_code: string
          region: string | null
          state_code: string
        }
        Insert: {
          area_code: string
          region?: string | null
          state_code: string
        }
        Update: {
          area_code?: string
          region?: string | null
          state_code?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          company_id: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          occurred_at: string
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          company_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          occurred_at?: string
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          company_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          occurred_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      call_attempts: {
        Row: {
          agent_id: string | null
          answered_at: string | null
          attempt_number: number
          call_recording_id: string | null
          call_source: string
          call_status: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          dial_mode_used: string | null
          dial_session_id: string | null
          disposition: string | null
          duration_seconds: number | null
          ended_at: string | null
          error_message: string | null
          from_number: string | null
          id: string
          manual_dialed_e164: string | null
          manual_dialed_number: string | null
          notes: string | null
          outbound_number_used: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          provider_used: string | null
          recording_url: string | null
          started_at: string | null
          telnyx_call_control_id: string | null
          telnyx_call_id: string | null
          telnyx_call_session_id: string | null
          to_number: string | null
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          attempt_number?: number
          call_recording_id?: string | null
          call_source?: string
          call_status?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          dial_mode_used?: string | null
          dial_session_id?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          manual_dialed_e164?: string | null
          manual_dialed_number?: string | null
          notes?: string | null
          outbound_number_used?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          provider_used?: string | null
          recording_url?: string | null
          started_at?: string | null
          telnyx_call_control_id?: string | null
          telnyx_call_id?: string | null
          telnyx_call_session_id?: string | null
          to_number?: string | null
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          attempt_number?: number
          call_recording_id?: string | null
          call_source?: string
          call_status?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          dial_mode_used?: string | null
          dial_session_id?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          manual_dialed_e164?: string | null
          manual_dialed_number?: string | null
          notes?: string | null
          outbound_number_used?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          provider_used?: string | null
          recording_url?: string | null
          started_at?: string | null
          telnyx_call_control_id?: string | null
          telnyx_call_id?: string | null
          telnyx_call_session_id?: string | null
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_attempts_dial_session_id_fkey"
            columns: ["dial_session_id"]
            isOneToOne: false
            referencedRelation: "dial_sessions"
            referencedColumns: ["id"]
          },
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
      call_dispositions: {
        Row: {
          agent_id: string | null
          call_session_id: string | null
          callback_datetime: string | null
          campaign_id: string | null
          created_at: string
          disposition: string
          id: string
          lead_id: string
          notes: string | null
        }
        Insert: {
          agent_id?: string | null
          call_session_id?: string | null
          callback_datetime?: string | null
          campaign_id?: string | null
          created_at?: string
          disposition: string
          id?: string
          lead_id: string
          notes?: string | null
        }
        Update: {
          agent_id?: string | null
          call_session_id?: string | null
          callback_datetime?: string | null
          campaign_id?: string | null
          created_at?: string
          disposition?: string
          id?: string
          lead_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_dispositions_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_events: {
        Row: {
          call_attempt_id: string
          event_type: Database["public"]["Enums"]["call_event_type"]
          id: string
          occurred_at: string
          payload: Json | null
        }
        Insert: {
          call_attempt_id: string
          event_type: Database["public"]["Enums"]["call_event_type"]
          id?: string
          occurred_at?: string
          payload?: Json | null
        }
        Update: {
          call_attempt_id?: string
          event_type?: Database["public"]["Enums"]["call_event_type"]
          id?: string
          occurred_at?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_attempt_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_monitoring_sessions: {
        Row: {
          agent_id: string
          call_attempt_id: string
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
          call_attempt_id: string
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
          call_attempt_id?: string
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
      call_recordings: {
        Row: {
          agent_id: string | null
          available_at: string | null
          call_attempt_id: string | null
          call_session_id: string | null
          campaign_id: string | null
          connection_id: string | null
          created_at: string
          download_url: string | null
          duration_seconds: number | null
          format: string | null
          id: string
          lead_id: string | null
          recording_url: string | null
          status: string
          telnyx_call_control_id: string | null
          telnyx_call_leg_id: string | null
          telnyx_recording_id: string | null
        }
        Insert: {
          agent_id?: string | null
          available_at?: string | null
          call_attempt_id?: string | null
          call_session_id?: string | null
          campaign_id?: string | null
          connection_id?: string | null
          created_at?: string
          download_url?: string | null
          duration_seconds?: number | null
          format?: string | null
          id?: string
          lead_id?: string | null
          recording_url?: string | null
          status?: string
          telnyx_call_control_id?: string | null
          telnyx_call_leg_id?: string | null
          telnyx_recording_id?: string | null
        }
        Update: {
          agent_id?: string | null
          available_at?: string | null
          call_attempt_id?: string | null
          call_session_id?: string | null
          campaign_id?: string | null
          connection_id?: string | null
          created_at?: string
          download_url?: string | null
          duration_seconds?: number | null
          format?: string | null
          id?: string
          lead_id?: string | null
          recording_url?: string | null
          status?: string
          telnyx_call_control_id?: string | null
          telnyx_call_leg_id?: string | null
          telnyx_recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordings_call_log_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          agent_id: string | null
          answered_at: string | null
          campaign_id: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          failure_reason: string | null
          from_number: string | null
          id: string
          lead_id: string
          recording_download_url: string | null
          recording_id: string | null
          recording_status: string | null
          recording_url: string | null
          started_at: string
          status: string
          telnyx_call_control_id: string | null
          telnyx_call_leg_id: string | null
          to_number: string | null
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          campaign_id?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          failure_reason?: string | null
          from_number?: string | null
          id?: string
          lead_id: string
          recording_download_url?: string | null
          recording_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
          telnyx_call_control_id?: string | null
          telnyx_call_leg_id?: string | null
          to_number?: string | null
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          campaign_id?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          failure_reason?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string
          recording_download_url?: string | null
          recording_id?: string | null
          recording_status?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
          telnyx_call_control_id?: string | null
          telnyx_call_leg_id?: string | null
          to_number?: string | null
        }
        Relationships: []
      }
      call_transcripts: {
        Row: {
          call_recording_id: string
          created_at: string
          error_message: string | null
          id: string
          language: string | null
          source: string
          status: string
          transcript_text: string
          updated_at: string
        }
        Insert: {
          call_recording_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          source?: string
          status?: string
          transcript_text?: string
          updated_at?: string
        }
        Update: {
          call_recording_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          source?: string
          status?: string
          transcript_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_transcripts_recording_id_fkey"
            columns: ["call_recording_id"]
            isOneToOne: false
            referencedRelation: "call_recordings"
            referencedColumns: ["id"]
          },
        ]
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
      caller_ids: {
        Row: {
          answered_calls: number
          appointments: number
          area_code: string | null
          company_id: string
          cooldown_minutes: number
          cooldown_until: string | null
          created_at: string
          display_name: string | null
          health_status: Database["public"]["Enums"]["number_health_status"]
          id: string
          is_active: boolean
          last_used_at: string | null
          max_calls_per_day: number
          max_calls_per_hour: number
          phone_e164: string
          provider: string
          total_calls: number
          updated_at: string
        }
        Insert: {
          answered_calls?: number
          appointments?: number
          area_code?: string | null
          company_id: string
          cooldown_minutes?: number
          cooldown_until?: string | null
          created_at?: string
          display_name?: string | null
          health_status?: Database["public"]["Enums"]["number_health_status"]
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_calls_per_day?: number
          max_calls_per_hour?: number
          phone_e164: string
          provider?: string
          total_calls?: number
          updated_at?: string
        }
        Update: {
          answered_calls?: number
          appointments?: number
          area_code?: string | null
          company_id?: string
          cooldown_minutes?: number
          cooldown_until?: string | null
          created_at?: string
          display_name?: string | null
          health_status?: Database["public"]["Enums"]["number_health_status"]
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_calls_per_day?: number
          max_calls_per_hour?: number
          phone_e164?: string
          provider?: string
          total_calls?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caller_ids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caller_ids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      campaign_caller_ids: {
        Row: {
          caller_id: string
          campaign_id: string
          created_at: string
          id: string
          priority: number
          rotation_order: number
        }
        Insert: {
          caller_id: string
          campaign_id: string
          created_at?: string
          id?: string
          priority?: number
          rotation_order?: number
        }
        Update: {
          caller_id?: string
          campaign_id?: string
          created_at?: string
          id?: string
          priority?: number
          rotation_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_caller_ids_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "caller_ids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_caller_ids_campaign_id_fkey"
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
          assigned_date: string | null
          assignment_status: string | null
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
          assigned_date?: string | null
          assignment_status?: string | null
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
          assigned_date?: string | null
          assignment_status?: string | null
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
          area_code: string
          campaign_id: string
          created_at: string
          health_score: number
          id: string
          is_active: boolean
          phone_number: string
        }
        Insert: {
          area_code: string
          campaign_id: string
          created_at?: string
          health_score?: number
          id?: string
          is_active?: boolean
          phone_number: string
        }
        Update: {
          area_code?: string
          campaign_id?: string
          created_at?: string
          health_score?: number
          id?: string
          is_active?: boolean
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_phone_numbers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          company_id: string | null
          created_at: string
          created_by: string | null
          dial_mode: string | null
          id: string
          local_presence_enabled: boolean
          max_attempts: number | null
          max_concurrent_agents: number | null
          min_wait_seconds: number | null
          name: string
          pacing_ratio: number
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
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dial_mode?: string | null
          id?: string
          local_presence_enabled?: boolean
          max_attempts?: number | null
          max_concurrent_agents?: number | null
          min_wait_seconds?: number | null
          name: string
          pacing_ratio?: number
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
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dial_mode?: string | null
          id?: string
          local_presence_enabled?: boolean
          max_attempts?: number | null
          max_concurrent_agents?: number | null
          min_wait_seconds?: number | null
          name?: string
          pacing_ratio?: number
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
            foreignKeyName: "campaigns_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      client_notifications: {
        Row: {
          body: string | null
          campaign_id: string | null
          client_account_id: string | null
          company_id: string
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          notification_type: string
          title: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          client_account_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          notification_type: string
          title: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          client_account_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          notification_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "client_users_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
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
      contact_phone_numbers: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          id: string
          is_dnc: boolean
          is_primary: boolean
          is_voicemail_only: boolean
          is_wrong_number: boolean
          last_called_at: string | null
          phone_e164: string
          phone_raw: string | null
          phone_type: Database["public"]["Enums"]["phone_type"]
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          is_dnc?: boolean
          is_primary?: boolean
          is_voicemail_only?: boolean
          is_wrong_number?: boolean
          last_called_at?: string | null
          phone_e164: string
          phone_raw?: string | null
          phone_type?: Database["public"]["Enums"]["phone_type"]
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_dnc?: boolean
          is_primary?: boolean
          is_voicemail_only?: boolean
          is_wrong_number?: boolean
          last_called_at?: string | null
          phone_e164?: string
          phone_raw?: string | null
          phone_type?: Database["public"]["Enums"]["phone_type"]
        }
        Relationships: [
          {
            foreignKeyName: "contact_phone_numbers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phone_numbers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phone_numbers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contact_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phone_numbers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          cool_notes: string | null
          county: string | null
          created_at: string
          credit_rating: string | null
          email: string | null
          email_secondary: string | null
          first_name: string
          home_value: string | null
          household_income: string | null
          id: string
          last_name: string
          lead_import_id: string | null
          lead_source: string | null
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          locked_at: string | null
          locked_to_agent_id: string | null
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          owner_renter: string | null
          phone_e164: string | null
          phone_raw: string | null
          property_type: string | null
          state: string | null
          tags: string[]
          timezone: string | null
          title: string | null
          updated_at: string
          year_built: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          cool_notes?: string | null
          county?: string | null
          created_at?: string
          credit_rating?: string | null
          email?: string | null
          email_secondary?: string | null
          first_name: string
          home_value?: string | null
          household_income?: string | null
          id?: string
          last_name: string
          lead_import_id?: string | null
          lead_source?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          locked_at?: string | null
          locked_to_agent_id?: string | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          property_type?: string | null
          state?: string | null
          tags?: string[]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          year_built?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          cool_notes?: string | null
          county?: string | null
          created_at?: string
          credit_rating?: string | null
          email?: string | null
          email_secondary?: string | null
          first_name?: string
          home_value?: string | null
          household_income?: string | null
          id?: string
          last_name?: string
          lead_import_id?: string | null
          lead_source?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"] | null
          locked_at?: string | null
          locked_to_agent_id?: string | null
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          owner_renter?: string | null
          phone_e164?: string | null
          phone_raw?: string | null
          property_type?: string | null
          state?: string | null
          tags?: string[]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          year_built?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_job_id_fkey"
            columns: ["lead_import_id"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_lead_assignments: {
        Row: {
          agent_id: string
          assigned_by: string | null
          assigned_date: string
          call_attempt_id: string | null
          campaign_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          disposition: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          queue_position: number
          status: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_by?: string | null
          assigned_date?: string
          call_attempt_id?: string | null
          campaign_id: string
          completed_at?: string | null
          contact_id: string
          created_at?: string
          disposition?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          queue_position?: number
          status?: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_by?: string | null
          assigned_date?: string
          call_attempt_id?: string | null
          campaign_id?: string
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          disposition?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          queue_position?: number
          status?: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at?: string
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          agent_id: string | null
          campaign_id: string | null
          company_id: string
          created_at: string
          id: string
          report_date: string
          talk_time_seconds: number
          total_appointments: number
          total_attempts: number
          total_callbacks: number
          total_connects: number
          total_dnc: number
          total_voicemails: number
          total_wrong_numbers: number
        }
        Insert: {
          agent_id?: string | null
          campaign_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          report_date: string
          talk_time_seconds?: number
          total_appointments?: number
          total_attempts?: number
          total_callbacks?: number
          total_connects?: number
          total_dnc?: number
          total_voicemails?: number
          total_wrong_numbers?: number
        }
        Update: {
          agent_id?: string | null
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          report_date?: string
          talk_time_seconds?: number
          total_appointments?: number
          total_attempts?: number
          total_callbacks?: number
          total_connects?: number
          total_dnc?: number
          total_voicemails?: number
          total_wrong_numbers?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dial_sessions: {
        Row: {
          agent_id: string
          campaign_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          paused_seconds: number
          started_at: string
          status: Database["public"]["Enums"]["dial_session_status"]
          total_appointments: number
          total_attempts: number
          total_connects: number
        }
        Insert: {
          agent_id: string
          campaign_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          paused_seconds?: number
          started_at?: string
          status?: Database["public"]["Enums"]["dial_session_status"]
          total_appointments?: number
          total_attempts?: number
          total_connects?: number
        }
        Update: {
          agent_id?: string
          campaign_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          paused_seconds?: number
          started_at?: string
          status?: Database["public"]["Enums"]["dial_session_status"]
          total_appointments?: number
          total_attempts?: number
          total_connects?: number
        }
        Relationships: [
          {
            foreignKeyName: "dial_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      dialer_logs: {
        Row: {
          campaign_id: string | null
          created_at: string
          destination_number: string
          id: string
          selected_number: string
          selection_reason: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          destination_number: string
          id?: string
          selected_number: string
          selection_reason: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          destination_number?: string
          id?: string
          selected_number?: string
          selection_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialer_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
      dnc_entries: {
        Row: {
          added_at: string
          added_by: string | null
          company_id: string | null
          id: string
          phone_e164: string
          reason: string | null
          source: Database["public"]["Enums"]["dnc_source"]
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          company_id?: string | null
          id?: string
          phone_e164: string
          reason?: string | null
          source?: Database["public"]["Enums"]["dnc_source"]
        }
        Update: {
          added_at?: string
          added_by?: string | null
          company_id?: string | null
          id?: string
          phone_e164?: string
          reason?: string | null
          source?: Database["public"]["Enums"]["dnc_source"]
        }
        Relationships: [
          {
            foreignKeyName: "dnc_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dnc_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_tasks: {
        Row: {
          agent_id: string | null
          appointment_id: string | null
          assigned_to: string | null
          campaign_id: string | null
          company_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          description: string | null
          due_at: string
          id: string
          status: Database["public"]["Enums"]["follow_up_task_status"]
          task_type: Database["public"]["Enums"]["follow_up_task_type"]
          title: string
        }
        Insert: {
          agent_id?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          company_id: string
          completed_at?: string | null
          contact_id: string
          created_at?: string
          description?: string | null
          due_at: string
          id?: string
          status?: Database["public"]["Enums"]["follow_up_task_status"]
          task_type?: Database["public"]["Enums"]["follow_up_task_type"]
          title: string
        }
        Update: {
          agent_id?: string | null
          appointment_id?: string | null
          assigned_to?: string | null
          campaign_id?: string | null
          company_id?: string
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          description?: string | null
          due_at?: string
          id?: string
          status?: Database["public"]["Enums"]["follow_up_task_status"]
          task_type?: Database["public"]["Enums"]["follow_up_task_type"]
          title?: string
        }
        Relationships: []
      }
      lead_import_rows: {
        Row: {
          error_message: string | null
          id: string
          lead_import_id: string
          raw_payload: Json | null
          row_number: number | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          lead_import_id: string
          raw_payload?: Json | null
          row_number?: number | null
        }
        Update: {
          error_message?: string | null
          id?: string
          lead_import_id?: string
          raw_payload?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_import_job_id_fkey"
            columns: ["lead_import_id"]
            isOneToOne: false
            referencedRelation: "lead_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
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
      lead_qualifications: {
        Row: {
          agent_id: string | null
          buying_intent: string | null
          call_attempt_id: string | null
          campaign_id: string | null
          closer_notes: string | null
          company_id: string | null
          contact_id: string
          created_at: string
          homeowner_status: string | null
          id: string
          insurance_involved: boolean | null
          insurance_status: string | null
          job_scope: string | null
          property_address: string | null
          roofing_issue: string | null
          timeline: string | null
          updated_at: string
          urgency: Database["public"]["Enums"]["urgency_level"]
        }
        Insert: {
          agent_id?: string | null
          buying_intent?: string | null
          call_attempt_id?: string | null
          campaign_id?: string | null
          closer_notes?: string | null
          company_id?: string | null
          contact_id: string
          created_at?: string
          homeowner_status?: string | null
          id?: string
          insurance_involved?: boolean | null
          insurance_status?: string | null
          job_scope?: string | null
          property_address?: string | null
          roofing_issue?: string | null
          timeline?: string | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Update: {
          agent_id?: string | null
          buying_intent?: string | null
          call_attempt_id?: string | null
          campaign_id?: string | null
          closer_notes?: string | null
          company_id?: string | null
          contact_id?: string
          created_at?: string
          homeowner_status?: string | null
          id?: string
          insurance_involved?: boolean | null
          insurance_status?: string | null
          job_scope?: string | null
          property_address?: string | null
          roofing_issue?: string | null
          timeline?: string | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"]
        }
        Relationships: []
      }
      notes: {
        Row: {
          acknowledged: boolean
          agent_id: string
          call_attempt_id: string | null
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
          call_attempt_id?: string | null
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
          call_attempt_id?: string | null
          campaign_id?: string | null
          created_at?: string
          feedback_by?: string
          feedback_type?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      number_pool: {
        Row: {
          area_code: string
          call_count_today: number
          call_count_total: number
          company_id: string | null
          cooldown_until: string | null
          created_at: string
          daily_limit: number
          id: string
          is_fallback: boolean
          last_used_at: string | null
          phone_number: string
          region: string | null
          spam_score: number
          state_code: string | null
          status: string
          telnyx_number_id: string | null
          updated_at: string
        }
        Insert: {
          area_code: string
          call_count_today?: number
          call_count_total?: number
          company_id?: string | null
          cooldown_until?: string | null
          created_at?: string
          daily_limit?: number
          id?: string
          is_fallback?: boolean
          last_used_at?: string | null
          phone_number: string
          region?: string | null
          spam_score?: number
          state_code?: string | null
          status?: string
          telnyx_number_id?: string | null
          updated_at?: string
        }
        Update: {
          area_code?: string
          call_count_today?: number
          call_count_total?: number
          company_id?: string | null
          cooldown_until?: string | null
          created_at?: string
          daily_limit?: number
          id?: string
          is_fallback?: boolean
          last_used_at?: string | null
          phone_number?: string
          region?: string | null
          spam_score?: number
          state_code?: string | null
          status?: string
          telnyx_number_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agent_status: Database["public"]["Enums"]["agent_status"] | null
          avatar_url: string | null
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reviews: {
        Row: {
          agent_id: string
          call_attempt_id: string
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
          call_attempt_id: string
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
          call_attempt_id?: string
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
      technician_appointments: {
        Row: {
          appointment_id: string | null
          campaign_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          lead_address: string | null
          notes: string | null
          required_skill: string | null
          start_time: string
          status: Database["public"]["Enums"]["technician_appointment_status"]
          technician_id: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          campaign_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          lead_address?: string | null
          notes?: string | null
          required_skill?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["technician_appointment_status"]
          technician_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          campaign_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          lead_address?: string | null
          notes?: string | null
          required_skill?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["technician_appointment_status"]
          technician_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_appointments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          home_address: string | null
          home_lat: number | null
          home_lng: number | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          service_areas: string[]
          skills: string[]
          updated_at: string
          user_id: string | null
          working_days: number[]
          working_hours_end: string
          working_hours_start: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          home_address?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          service_areas?: string[]
          skills?: string[]
          updated_at?: string
          user_id?: string | null
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          home_address?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          service_areas?: string[]
          skills?: string[]
          updated_at?: string
          user_id?: string | null
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
        }
        Relationships: []
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
      training_assets: {
        Row: {
          agent_id: string
          created_at: string
          difficulty: string
          duration_seconds: number | null
          ended_at: string | null
          feedback: string | null
          id: string
          scenario: string
          score: number | null
          status: string
          transcript: Json
        }
        Insert: {
          agent_id: string
          created_at?: string
          difficulty?: string
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          id?: string
          scenario: string
          score?: number | null
          status?: string
          transcript?: Json
        }
        Update: {
          agent_id?: string
          created_at?: string
          difficulty?: string
          duration_seconds?: number | null
          ended_at?: string | null
          feedback?: string | null
          id?: string
          scenario?: string
          score?: number | null
          status?: string
          transcript?: Json
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
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          source?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      campaign_lead_availability: {
        Row: {
          assigned_leads: number | null
          available_leads: number | null
          campaign_id: string | null
          completed_leads: number | null
          total_leads: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
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
      bulk_assign_leads: {
        Args: { p_agent_id: string; p_campaign_id: string; p_quantity: number }
        Returns: number
      }
      bulk_unassign_leads: {
        Args: { p_agent_id: string; p_campaign_id: string; p_quantity: number }
        Returns: number
      }
      complete_dial_attempt: {
        Args: {
          _call_attempt_id: string
          _callback_at?: string
          _disposition: string
          _notes?: string
        }
        Returns: undefined
      }
      complete_queue_assignment: {
        Args: {
          _assignment_id: string
          _call_attempt_id: string
          _disposition: string
          _notes: string
        }
        Returns: {
          agent_id: string
          assigned_by: string | null
          assigned_date: string
          call_attempt_id: string | null
          campaign_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          disposition: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          queue_position: number
          status: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_lead_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contact_in_user_company: {
        Args: { _contact_id: string }
        Returns: boolean
      }
      current_company_id: { Args: never; Returns: string }
      fn_get_and_reserve_caller_id: {
        Args: { lead_phone: string }
        Returns: {
          match_type: string
          number_id: string
          phone_number: string
        }[]
      }
      fn_release_caller_id: { Args: { _number_id: string }; Returns: undefined }
      fn_reset_number_pool_daily: { Args: never; Returns: undefined }
      get_next_lead_for_agent: {
        Args: { _agent_id: string; _campaign_id: string }
        Returns: {
          attempts: number
          campaign_contact_id: string
          city: string
          contact_id: string
          first_name: string
          last_name: string
          phone_e164: string
          priority_band: Database["public"]["Enums"]["priority_band"]
          priority_score: number
          state: string
          zip_code: string
        }[]
      }
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
      is_contact_dialable: {
        Args: { _campaign_id: string; _contact_id: string }
        Returns: boolean
      }
      is_same_company: { Args: { _company_id: string }; Returns: boolean }
      lock_next_daily_assignment: {
        Args: { _agent_id: string; _campaign_id?: string }
        Returns: {
          agent_id: string
          assigned_by: string | null
          assigned_date: string
          call_attempt_id: string | null
          campaign_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          disposition: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          queue_position: number
          status: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_lead_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_queue_assignment: {
        Args: { _assignment_id: string }
        Returns: {
          agent_id: string
          assigned_by: string | null
          assigned_date: string
          call_attempt_id: string | null
          campaign_id: string
          completed_at: string | null
          contact_id: string
          created_at: string
          disposition: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          queue_position: number
          status: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_lead_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_audit_event: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _event_type: string
          _metadata?: Json
        }
        Returns: string
      }
      record_call_event: {
        Args: {
          _event_type: Database["public"]["Enums"]["call_event_type"]
          _payload?: Json
          _telnyx_call_id: string
        }
        Returns: string
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
      app_role:
        | "admin"
        | "manager"
        | "agent"
        | "client"
        | "team_leader"
        | "technician"
      appointment_status:
        | "booked"
        | "confirmed"
        | "rescheduled"
        | "completed"
        | "no_show"
        | "replaced"
      appointment_type: "on_site_inspection" | "virtual_consultation"
      call_event_type:
        | "initiated"
        | "ringing"
        | "answered"
        | "no_answer"
        | "voicemail"
        | "busy"
        | "failed"
        | "hangup_local"
        | "hangup_remote"
        | "dtmf"
        | "recording_started"
        | "recording_completed"
        | "transferred"
      call_outcome:
        | "pending"
        | "connected"
        | "no_answer"
        | "voicemail"
        | "busy"
        | "wrong_number"
        | "dnc_request"
        | "not_interested"
        | "callback_scheduled"
        | "appointment_booked"
        | "already_customer"
        | "failed"
      callback_status: "pending" | "completed" | "missed" | "cancelled"
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      daily_assignment_status:
        | "new"
        | "assigned"
        | "calling"
        | "completed"
        | "callback"
        | "no_answer"
        | "voicemail"
        | "not_interested"
        | "appointment_set"
        | "do_not_call"
      dial_session_status: "active" | "paused" | "ended"
      dial_status: "pending" | "dialing" | "completed" | "skipped" | "failed"
      dnc_source:
        | "agent"
        | "consumer_request"
        | "federal_dnc"
        | "litigator"
        | "imported"
      follow_up_task_status: "pending" | "completed" | "skipped" | "cancelled"
      follow_up_task_type:
        | "confirmation_call"
        | "reminder_24h"
        | "send_appointment_details"
        | "closer_handoff"
        | "post_appointment_followup"
        | "custom"
      import_status:
        | "uploading"
        | "mapping"
        | "processing"
        | "completed"
        | "failed"
      lead_status: "new" | "contacted" | "qualified" | "converted" | "dead"
      note_type:
        | "call_note"
        | "contact_note"
        | "agent_feedback"
        | "qa_note"
        | "system"
      number_health_status:
        | "healthy"
        | "warm"
        | "fatigued"
        | "cooling_down"
        | "blocked"
      phone_type: "mobile" | "home" | "work" | "other"
      priority_band: "hot" | "warm" | "medium" | "low" | "excluded"
      technician_appointment_status:
        | "scheduled"
        | "en_route"
        | "on_site"
        | "completed"
        | "cancelled"
        | "no_show"
      training_material_type:
        | "script"
        | "objection"
        | "rebuttal"
        | "talking_point"
        | "qualification_question"
        | "closing_line"
      urgency_level: "low" | "medium" | "high" | "urgent"
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
      app_role: [
        "admin",
        "manager",
        "agent",
        "client",
        "team_leader",
        "technician",
      ],
      appointment_status: [
        "booked",
        "confirmed",
        "rescheduled",
        "completed",
        "no_show",
        "replaced",
      ],
      appointment_type: ["on_site_inspection", "virtual_consultation"],
      call_event_type: [
        "initiated",
        "ringing",
        "answered",
        "no_answer",
        "voicemail",
        "busy",
        "failed",
        "hangup_local",
        "hangup_remote",
        "dtmf",
        "recording_started",
        "recording_completed",
        "transferred",
      ],
      call_outcome: [
        "pending",
        "connected",
        "no_answer",
        "voicemail",
        "busy",
        "wrong_number",
        "dnc_request",
        "not_interested",
        "callback_scheduled",
        "appointment_booked",
        "already_customer",
        "failed",
      ],
      callback_status: ["pending", "completed", "missed", "cancelled"],
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      daily_assignment_status: [
        "new",
        "assigned",
        "calling",
        "completed",
        "callback",
        "no_answer",
        "voicemail",
        "not_interested",
        "appointment_set",
        "do_not_call",
      ],
      dial_session_status: ["active", "paused", "ended"],
      dial_status: ["pending", "dialing", "completed", "skipped", "failed"],
      dnc_source: [
        "agent",
        "consumer_request",
        "federal_dnc",
        "litigator",
        "imported",
      ],
      follow_up_task_status: ["pending", "completed", "skipped", "cancelled"],
      follow_up_task_type: [
        "confirmation_call",
        "reminder_24h",
        "send_appointment_details",
        "closer_handoff",
        "post_appointment_followup",
        "custom",
      ],
      import_status: [
        "uploading",
        "mapping",
        "processing",
        "completed",
        "failed",
      ],
      lead_status: ["new", "contacted", "qualified", "converted", "dead"],
      note_type: [
        "call_note",
        "contact_note",
        "agent_feedback",
        "qa_note",
        "system",
      ],
      number_health_status: [
        "healthy",
        "warm",
        "fatigued",
        "cooling_down",
        "blocked",
      ],
      phone_type: ["mobile", "home", "work", "other"],
      priority_band: ["hot", "warm", "medium", "low", "excluded"],
      technician_appointment_status: [
        "scheduled",
        "en_route",
        "on_site",
        "completed",
        "cancelled",
        "no_show",
      ],
      training_material_type: [
        "script",
        "objection",
        "rebuttal",
        "talking_point",
        "qualification_question",
        "closing_line",
      ],
      urgency_level: ["low", "medium", "high", "urgent"],
    },
  },
} as const
