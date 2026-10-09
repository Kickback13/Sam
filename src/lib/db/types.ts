export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          metadata: NonNullable<Json>;
          occurred_at: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["subject_type"];
          type: Database["public"]["Enums"]["activity_type"];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          occurred_at?: string;
          subject_id: string;
          subject_type: Database["public"]["Enums"]["subject_type"];
          type: Database["public"]["Enums"]["activity_type"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          occurred_at?: string;
          subject_id?: string;
          subject_type?: Database["public"]["Enums"]["subject_type"];
          type?: Database["public"]["Enums"]["activity_type"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          diff: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          address: string | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          search_text: string;
          state: string | null;
          tags: string[];
          type: string | null;
          updated_at: string;
          website: string | null;
          workspace_id: string;
          zip: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          search_text?: string;
          state?: string | null;
          tags?: string[];
          type?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id: string;
          zip?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          search_text?: string;
          state?: string | null;
          tags?: string[];
          type?: string | null;
          updated_at?: string;
          website?: string | null;
          workspace_id?: string;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          address: string | null;
          assigned_to: string | null;
          city: string | null;
          company_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          dnc: boolean;
          email_keys: string[];
          email_opt_out: boolean;
          email_opt_out_at: string | null;
          emails: NonNullable<Json>;
          first_name: string | null;
          full_name: string | null;
          ghl_contact_id: string | null;
          id: string;
          language: string;
          last_name: string | null;
          notes: string | null;
          phone_keys: string[];
          phones: NonNullable<Json>;
          roles: string[];
          search_text: string;
          sms_consent: Database["public"]["Enums"]["sms_consent"];
          sms_consent_at: string | null;
          sms_consent_source: string | null;
          source: string | null;
          state: string | null;
          tags: string[];
          title: string | null;
          updated_at: string;
          workspace_id: string;
          zip: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          assigned_to?: string | null;
          city?: string | null;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dnc?: boolean;
          email_keys?: string[];
          email_opt_out?: boolean;
          email_opt_out_at?: string | null;
          emails?: NonNullable<Json>;
          first_name?: string | null;
          full_name?: never;
          ghl_contact_id?: string | null;
          id?: string;
          language?: string;
          last_name?: string | null;
          notes?: string | null;
          phone_keys?: string[];
          phones?: NonNullable<Json>;
          roles?: string[];
          search_text?: string;
          sms_consent?: Database["public"]["Enums"]["sms_consent"];
          sms_consent_at?: string | null;
          sms_consent_source?: string | null;
          source?: string | null;
          state?: string | null;
          tags?: string[];
          title?: string | null;
          updated_at?: string;
          workspace_id: string;
          zip?: string | null;
        };
        Update: {
          address?: string | null;
          assigned_to?: string | null;
          city?: string | null;
          company_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dnc?: boolean;
          email_keys?: string[];
          email_opt_out?: boolean;
          email_opt_out_at?: string | null;
          emails?: NonNullable<Json>;
          first_name?: string | null;
          full_name?: never;
          ghl_contact_id?: string | null;
          id?: string;
          language?: string;
          last_name?: string | null;
          notes?: string | null;
          phone_keys?: string[];
          phones?: NonNullable<Json>;
          roles?: string[];
          search_text?: string;
          sms_consent?: Database["public"]["Enums"]["sms_consent"];
          sms_consent_at?: string | null;
          sms_consent_source?: string | null;
          source?: string | null;
          state?: string | null;
          tags?: string[];
          title?: string | null;
          updated_at?: string;
          workspace_id?: string;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_workspace_id_company_id_fkey";
            columns: ["workspace_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_contacts: {
        Row: {
          contact_id: string;
          created_at: string;
          deal_id: string;
          role: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          contact_id: string;
          created_at?: string;
          deal_id: string;
          role?: string | null;
          workspace_id: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          deal_id?: string;
          role?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_contacts_workspace_id_contact_id_fkey";
            columns: ["workspace_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deal_contacts_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deal_contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_stage_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          deal_id: string;
          from_stage_id: string | null;
          from_stage_name: string | null;
          id: string;
          to_stage_id: string | null;
          to_stage_name: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          deal_id: string;
          from_stage_id?: string | null;
          from_stage_name?: string | null;
          id?: string;
          to_stage_id?: string | null;
          to_stage_name?: string | null;
          workspace_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          deal_id?: string;
          from_stage_id?: string | null;
          from_stage_name?: string | null;
          id?: string;
          to_stage_id?: string | null;
          to_stage_name?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_from_stage_id_fkey";
            columns: ["from_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey";
            columns: ["to_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_stage_history_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deal_stage_history_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          asking_price: number | null;
          assigned_to: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          expected_close: string | null;
          id: string;
          lost_reason: string | null;
          notes: string | null;
          pipeline_id: string;
          position: number;
          primary_contact_id: string | null;
          property_id: string | null;
          search_text: string;
          source: string | null;
          stage_entered_at: string;
          stage_id: string;
          status: Database["public"]["Enums"]["deal_status"];
          title: string;
          units: number | null;
          updated_at: string;
          value: number | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          asking_price?: number | null;
          assigned_to?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expected_close?: string | null;
          id?: string;
          lost_reason?: string | null;
          notes?: string | null;
          pipeline_id: string;
          position?: number;
          primary_contact_id?: string | null;
          property_id?: string | null;
          search_text?: string;
          source?: string | null;
          stage_entered_at?: string;
          stage_id: string;
          status?: Database["public"]["Enums"]["deal_status"];
          title: string;
          units?: number | null;
          updated_at?: string;
          value?: number | null;
          workspace_id: string;
        };
        Update: {
          asking_price?: number | null;
          assigned_to?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          expected_close?: string | null;
          id?: string;
          lost_reason?: string | null;
          notes?: string | null;
          pipeline_id?: string;
          position?: number;
          primary_contact_id?: string | null;
          property_id?: string | null;
          search_text?: string;
          source?: string | null;
          stage_entered_at?: string;
          stage_id?: string;
          status?: Database["public"]["Enums"]["deal_status"];
          title?: string;
          units?: number | null;
          updated_at?: string;
          value?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_pipeline_id_stage_id_fkey";
            columns: ["pipeline_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["pipeline_id", "id"];
          },
          {
            foreignKeyName: "deals_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_workspace_id_pipeline_id_fkey";
            columns: ["workspace_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deals_workspace_id_primary_contact_id_fkey";
            columns: ["workspace_id", "primary_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deals_workspace_id_property_id_fkey";
            columns: ["workspace_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      imports: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          created_count: number;
          dedupe_strategy: string;
          entity: string;
          error_count: number;
          errors: NonNullable<Json>;
          filename: string | null;
          id: string;
          mapping: NonNullable<Json>;
          skipped_count: number;
          status: Database["public"]["Enums"]["import_status"];
          total_rows: number;
          updated_at: string;
          updated_count: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_count?: number;
          dedupe_strategy?: string;
          entity?: string;
          error_count?: number;
          errors?: NonNullable<Json>;
          filename?: string | null;
          id?: string;
          mapping?: NonNullable<Json>;
          skipped_count?: number;
          status?: Database["public"]["Enums"]["import_status"];
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          workspace_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_count?: number;
          dedupe_strategy?: string;
          entity?: string;
          error_count?: number;
          errors?: NonNullable<Json>;
          filename?: string | null;
          id?: string;
          mapping?: NonNullable<Json>;
          skipped_count?: number;
          status?: Database["public"]["Enums"]["import_status"];
          total_rows?: number;
          updated_at?: string;
          updated_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "imports_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          account_email: string | null;
          config: NonNullable<Json>;
          connected_at: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          provider: string;
          status: Database["public"]["Enums"]["integration_status"];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          account_email?: string | null;
          config?: NonNullable<Json>;
          connected_at?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          provider: string;
          status?: Database["public"]["Enums"]["integration_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          account_email?: string | null;
          config?: NonNullable<Json>;
          connected_at?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          provider?: string;
          status?: Database["public"]["Enums"]["integration_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string | null;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stages: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_lost: boolean;
          is_won: boolean;
          name: string;
          pipeline_id: string;
          position: number;
          probability: number;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          name: string;
          pipeline_id: string;
          position?: number;
          probability?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          name?: string;
          pipeline_id?: string;
          position?: number;
          probability?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stages_workspace_id_pipeline_id_fkey";
            columns: ["workspace_id", "pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      pipelines: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          kind: Database["public"]["Enums"]["pipeline_kind"];
          name: string;
          position: number;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          kind: Database["public"]["Enums"]["pipeline_kind"];
          name: string;
          position?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          kind?: Database["public"]["Enums"]["pipeline_kind"];
          name?: string;
          position?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          last_workspace_id: string | null;
          phone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          last_workspace_id?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          last_workspace_id?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_workspace_id_fkey";
            columns: ["last_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          address: string;
          apn: string | null;
          assessed_value: number | null;
          building_sqft: number | null;
          buildings: number | null;
          city: string | null;
          county: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          field_sources: NonNullable<Json>;
          id: string;
          last_sale_date: string | null;
          last_sale_price: number | null;
          lat: number | null;
          lng: number | null;
          lot_sqft: number | null;
          name: string | null;
          notes: string | null;
          owner_company_id: string | null;
          owner_contact_id: string | null;
          property_type: string | null;
          search_text: string;
          state: string;
          submarket: string | null;
          tags: string[];
          units: number | null;
          updated_at: string;
          workspace_id: string;
          year_built: number | null;
          zip: string | null;
          zoning: string | null;
        };
        ComputedFields: never;
        Insert: {
          address: string;
          apn?: string | null;
          assessed_value?: number | null;
          building_sqft?: number | null;
          buildings?: number | null;
          city?: string | null;
          county?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          field_sources?: NonNullable<Json>;
          id?: string;
          last_sale_date?: string | null;
          last_sale_price?: number | null;
          lat?: number | null;
          lng?: number | null;
          lot_sqft?: number | null;
          name?: string | null;
          notes?: string | null;
          owner_company_id?: string | null;
          owner_contact_id?: string | null;
          property_type?: string | null;
          search_text?: string;
          state?: string;
          submarket?: string | null;
          tags?: string[];
          units?: number | null;
          updated_at?: string;
          workspace_id: string;
          year_built?: number | null;
          zip?: string | null;
          zoning?: string | null;
        };
        Update: {
          address?: string;
          apn?: string | null;
          assessed_value?: number | null;
          building_sqft?: number | null;
          buildings?: number | null;
          city?: string | null;
          county?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          field_sources?: NonNullable<Json>;
          id?: string;
          last_sale_date?: string | null;
          last_sale_price?: number | null;
          lat?: number | null;
          lng?: number | null;
          lot_sqft?: number | null;
          name?: string | null;
          notes?: string | null;
          owner_company_id?: string | null;
          owner_contact_id?: string | null;
          property_type?: string | null;
          search_text?: string;
          state?: string;
          submarket?: string | null;
          tags?: string[];
          units?: number | null;
          updated_at?: string;
          workspace_id?: string;
          year_built?: number | null;
          zip?: string | null;
          zoning?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "properties_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "properties_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "properties_workspace_id_owner_company_id_fkey";
            columns: ["workspace_id", "owner_company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "properties_workspace_id_owner_contact_id_fkey";
            columns: ["workspace_id", "owner_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          due_at: string | null;
          id: string;
          notes: string | null;
          related_id: string | null;
          related_type: Database["public"]["Enums"]["subject_type"] | null;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          notes?: string | null;
          related_id?: string | null;
          related_type?: Database["public"]["Enums"]["subject_type"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string | null;
          id?: string;
          notes?: string | null;
          related_id?: string | null;
          related_type?: Database["public"]["Enums"]["subject_type"] | null;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          brand: NonNullable<Json>;
          business_type: Database["public"]["Enums"]["business_type"];
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
          owner_email: string | null;
          profile: NonNullable<Json>;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: NonNullable<Json>;
          business_type: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
          owner_email?: string | null;
          profile?: NonNullable<Json>;
          slug: string;
          updated_at?: string;
        };
        Update: {
          brand?: NonNullable<Json>;
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
          owner_email?: string | null;
          profile?: NonNullable<Json>;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      accept_pending_invites: { Args: Record<PropertyKey, never>; Returns: number };
      find_contact_duplicates: {
        Args: { p_email_keys: string[]; p_phone_keys: string[]; p_workspace_id: string };
        Returns: {
          email_keys: string[];
          full_name: string;
          id: string;
          phone_keys: string[];
        }[];
      };
      get_invite: {
        Args: { p_token: string };
        Returns: {
          email_hint: string;
          is_email_bound: boolean;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
          workspace_name: string;
          workspace_slug: string;
        }[];
      };
      global_search: {
        Args: { p_limit?: number; p_query: string; p_workspace_id: string };
        Returns: {
          entity_type: string;
          id: string;
          score: number;
          subtitle: string;
          title: string;
        }[];
      };
      pipeline_stage_totals: {
        Args: { p_pipeline_id: string };
        Returns: {
          color: string;
          deal_count: number;
          is_lost: boolean;
          is_won: boolean;
          name: string;
          stage_id: string;
          stage_position: number;
          total_value: number;
        }[];
      };
      reorder_stages: {
        Args: { p_pipeline_id: string; p_stage_ids: string[] };
        Returns: undefined;
      };
      workspace_counts: { Args: { p_workspace_id: string }; Returns: Json };
    };
    Enums: {
      activity_type: "note" | "call" | "email" | "sms" | "meeting" | "stage_change" | "system";
      business_type: "real_estate" | "construction";
      deal_status: "open" | "won" | "lost";
      import_status: "pending" | "processing" | "completed" | "failed";
      integration_status: "not_connected" | "connected" | "error";
      member_role: "owner" | "admin" | "agent" | "viewer";
      pipeline_kind: "acquisition" | "disposition" | "construction_project";
      sms_consent: "none" | "express" | "written";
      subject_type: "contact" | "company" | "property" | "deal";
      task_status: "open" | "done" | "canceled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_type: ["note", "call", "email", "sms", "meeting", "stage_change", "system"],
      business_type: ["real_estate", "construction"],
      deal_status: ["open", "won", "lost"],
      import_status: ["pending", "processing", "completed", "failed"],
      integration_status: ["not_connected", "connected", "error"],
      member_role: ["owner", "admin", "agent", "viewer"],
      pipeline_kind: ["acquisition", "disposition", "construction_project"],
      sms_consent: ["none", "express", "written"],
      subject_type: ["contact", "company", "property", "deal"],
      task_status: ["open", "done", "canceled"],
    },
  },
} as const;
