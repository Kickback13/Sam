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
      azh_budget_lines: {
        Row: {
          budgeted: number;
          category: string;
          created_at: string;
          deal_id: string;
          id: string;
          position: number;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          budgeted?: number;
          category: string;
          created_at?: string;
          deal_id: string;
          id?: string;
          position?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          budgeted?: number;
          category?: string;
          created_at?: string;
          deal_id?: string;
          id?: string;
          position?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_budget_lines_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_budget_lines_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_change_orders: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          decided_on: string | null;
          description: string;
          id: string;
          number: number;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          decided_on?: string | null;
          description: string;
          id?: string;
          number: number;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          decided_on?: string | null;
          description?: string;
          id?: string;
          number?: number;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_change_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_change_orders_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_change_orders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_costs: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          id: string;
          notes: string | null;
          receipt_file_id: string | null;
          spent_on: string;
          updated_at: string;
          vendor: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          category: string;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          id?: string;
          notes?: string | null;
          receipt_file_id?: string | null;
          spent_on?: string;
          updated_at?: string;
          vendor?: string | null;
          workspace_id: string;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          id?: string;
          notes?: string | null;
          receipt_file_id?: string | null;
          spent_on?: string;
          updated_at?: string;
          vendor?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_costs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_costs_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_costs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_costs_workspace_id_receipt_file_id_fkey";
            columns: ["workspace_id", "receipt_file_id"];
            isOneToOne: false;
            referencedRelation: "azh_files";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      azh_estimate_items: {
        Row: {
          created_at: string;
          description: string;
          estimate_id: string;
          id: string;
          line_total: number;
          position: number;
          qty: number;
          unit: string | null;
          unit_price: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          estimate_id: string;
          id?: string;
          line_total?: number;
          position?: number;
          qty?: number;
          unit?: string | null;
          unit_price?: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          estimate_id?: string;
          id?: string;
          line_total?: number;
          position?: number;
          qty?: number;
          unit?: string | null;
          unit_price?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_estimate_items_workspace_id_estimate_id_fkey";
            columns: ["workspace_id", "estimate_id"];
            isOneToOne: false;
            referencedRelation: "azh_estimates";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_estimate_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_estimates: {
        Row: {
          accepted_on: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          declined_on: string | null;
          id: string;
          markup_amount: number;
          markup_pct: number;
          notes: string | null;
          revised_from: string | null;
          sent_on: string | null;
          status: string;
          subtotal: number;
          tax_amount: number;
          tax_pct: number;
          title: string;
          total: number;
          updated_at: string;
          valid_until: string | null;
          version: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_on?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          declined_on?: string | null;
          id?: string;
          markup_amount?: number;
          markup_pct?: number;
          notes?: string | null;
          revised_from?: string | null;
          sent_on?: string | null;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          tax_pct?: number;
          title?: string;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
          version?: number;
          workspace_id: string;
        };
        Update: {
          accepted_on?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          declined_on?: string | null;
          id?: string;
          markup_amount?: number;
          markup_pct?: number;
          notes?: string | null;
          revised_from?: string | null;
          sent_on?: string | null;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          tax_pct?: number;
          title?: string;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_estimates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_estimates_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_estimates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_estimates_workspace_id_revised_from_fkey";
            columns: ["workspace_id", "revised_from"];
            isOneToOne: false;
            referencedRelation: "azh_estimates";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      azh_files: {
        Row: {
          created_at: string;
          deal_id: string | null;
          id: string;
          kind: string;
          mime_type: string;
          name: string;
          path: string;
          request_id: string | null;
          size_bytes: number;
          uploaded_by: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind?: string;
          mime_type: string;
          name: string;
          path: string;
          request_id?: string | null;
          size_bytes: number;
          uploaded_by?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          name?: string;
          path?: string;
          request_id?: string | null;
          size_bytes?: number;
          uploaded_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_files_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_files_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_files_workspace_id_request_id_fkey";
            columns: ["workspace_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "azh_requests";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      azh_intake: {
        Row: {
          client_key: string | null;
          consent_text: string | null;
          created_at: string;
          description: string;
          email: string | null;
          id: string;
          job_address: string;
          job_zip: string;
          language: string;
          name: string;
          page_url: string | null;
          phone: string;
          photo_paths: string[];
          preferred_contact_time: string;
          processed_at: string | null;
          request_id: string | null;
          service_type: string;
          sms_consent: boolean;
          workspace_id: string | null;
          workspace_slug: string;
        };
        ComputedFields: never;
        Insert: {
          client_key?: string | null;
          consent_text?: string | null;
          created_at?: string;
          description: string;
          email?: string | null;
          id?: string;
          job_address: string;
          job_zip: string;
          language?: string;
          name: string;
          page_url?: string | null;
          phone: string;
          photo_paths?: string[];
          preferred_contact_time?: string;
          processed_at?: string | null;
          request_id?: string | null;
          service_type: string;
          sms_consent?: boolean;
          workspace_id?: string | null;
          workspace_slug: string;
        };
        Update: {
          client_key?: string | null;
          consent_text?: string | null;
          created_at?: string;
          description?: string;
          email?: string | null;
          id?: string;
          job_address?: string;
          job_zip?: string;
          language?: string;
          name?: string;
          page_url?: string | null;
          phone?: string;
          photo_paths?: string[];
          preferred_contact_time?: string;
          processed_at?: string | null;
          request_id?: string | null;
          service_type?: string;
          sms_consent?: boolean;
          workspace_id?: string | null;
          workspace_slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_intake_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_milestones: {
        Row: {
          created_at: string;
          created_by: string | null;
          deal_id: string;
          done_on: string | null;
          id: string;
          name: string;
          notes: string | null;
          planned_on: string | null;
          position: number;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          done_on?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          planned_on?: string | null;
          position?: number;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          done_on?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          planned_on?: string | null;
          position?: number;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_milestones_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_milestones_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_milestones_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_projects: {
        Row: {
          bid_sent_on: string | null;
          completed_on: string | null;
          contract_value: number | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          estimate_total: number | null;
          job_address: string | null;
          job_zip: string | null;
          notes: string | null;
          office: string | null;
          project_lead: string | null;
          property_id: string | null;
          service_types: string[];
          source: string | null;
          start_on: string | null;
          target_on: string | null;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          bid_sent_on?: string | null;
          completed_on?: string | null;
          contract_value?: number | null;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          estimate_total?: number | null;
          job_address?: string | null;
          job_zip?: string | null;
          notes?: string | null;
          office?: string | null;
          project_lead?: string | null;
          property_id?: string | null;
          service_types?: string[];
          source?: string | null;
          start_on?: string | null;
          target_on?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          bid_sent_on?: string | null;
          completed_on?: string | null;
          contract_value?: number | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          estimate_total?: number | null;
          job_address?: string | null;
          job_zip?: string | null;
          notes?: string | null;
          office?: string | null;
          project_lead?: string | null;
          property_id?: string | null;
          service_types?: string[];
          source?: string | null;
          start_on?: string | null;
          target_on?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_projects_project_lead_fkey";
            columns: ["project_lead"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_projects_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_projects_workspace_id_property_id_fkey";
            columns: ["workspace_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      azh_requests: {
        Row: {
          assigned_to: string | null;
          closed_at: string | null;
          contact_id: string | null;
          contacted_at: string | null;
          converted_at: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          description: string | null;
          id: string;
          job_address: string | null;
          job_zip: string | null;
          language: string;
          office: string;
          photo_paths: string[];
          preferred_contact_time: string | null;
          service_type: string | null;
          sms_consent: boolean;
          sms_consent_at: string | null;
          sms_consent_text: string | null;
          source: string;
          status: string;
          submitted_at: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          closed_at?: string | null;
          contact_id?: string | null;
          contacted_at?: string | null;
          converted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          description?: string | null;
          id?: string;
          job_address?: string | null;
          job_zip?: string | null;
          language?: string;
          office?: string;
          photo_paths?: string[];
          preferred_contact_time?: string | null;
          service_type?: string | null;
          sms_consent?: boolean;
          sms_consent_at?: string | null;
          sms_consent_text?: string | null;
          source?: string;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          assigned_to?: string | null;
          closed_at?: string | null;
          contact_id?: string | null;
          contacted_at?: string | null;
          converted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          description?: string | null;
          id?: string;
          job_address?: string | null;
          job_zip?: string | null;
          language?: string;
          office?: string;
          photo_paths?: string[];
          preferred_contact_time?: string | null;
          service_type?: string | null;
          sms_consent?: boolean;
          sms_consent_at?: string | null;
          sms_consent_text?: string | null;
          source?: string;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_requests_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_requests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_requests_workspace_id_contact_id_fkey";
            columns: ["workspace_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_requests_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_requests_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_settings: {
        Row: {
          created_at: string;
          cslb_license: string | null;
          fallbrook_assignee: string | null;
          fallbrook_assignees: string[];
          intake_enabled: boolean;
          san_diego_assignee: string | null;
          san_diego_assignees: string[];
          service_types: string[];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          cslb_license?: string | null;
          fallbrook_assignee?: string | null;
          fallbrook_assignees?: string[];
          intake_enabled?: boolean;
          san_diego_assignee?: string | null;
          san_diego_assignees?: string[];
          service_types?: string[];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          cslb_license?: string | null;
          fallbrook_assignee?: string | null;
          fallbrook_assignees?: string[];
          intake_enabled?: boolean;
          san_diego_assignee?: string | null;
          san_diego_assignees?: string[];
          service_types?: string[];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_settings_fallbrook_assignee_fkey";
            columns: ["fallbrook_assignee"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_settings_san_diego_assignee_fkey";
            columns: ["san_diego_assignee"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_upload_tickets: {
        Row: {
          client_key: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          mime_type: string;
          path: string;
          phone_key: string;
          size_bytes: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_key?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          mime_type: string;
          path: string;
          phone_key: string;
          size_bytes: number;
          workspace_id: string;
        };
        Update: {
          client_key?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          mime_type?: string;
          path?: string;
          phone_key?: string;
          size_bytes?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_upload_tickets_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      azh_visits: {
        Row: {
          address: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          ends_at: string;
          estimator_id: string | null;
          id: string;
          notes: string | null;
          office: string;
          request_id: string | null;
          starts_at: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          ends_at: string;
          estimator_id?: string | null;
          id?: string;
          notes?: string | null;
          office: string;
          request_id?: string | null;
          starts_at: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          ends_at?: string;
          estimator_id?: string | null;
          id?: string;
          notes?: string | null;
          office?: string;
          request_id?: string | null;
          starts_at?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_visits_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_visits_estimator_id_fkey";
            columns: ["estimator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_visits_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "azh_visits_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "azh_visits_workspace_id_request_id_fkey";
            columns: ["workspace_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "azh_requests";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      azh_zip_routes: {
        Row: {
          created_at: string;
          office: string;
          workspace_id: string;
          zip: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          office: string;
          workspace_id: string;
          zip: string;
        };
        Update: {
          created_at?: string;
          office?: string;
          workspace_id?: string;
          zip?: string;
        };
        Relationships: [
          {
            foreignKeyName: "azh_zip_routes_workspace_id_fkey";
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
      h4a_alerts: {
        Row: {
          created_at: string;
          email_error: string | null;
          email_sent_at: string | null;
          email_status: string;
          id: string;
          listing_id: string;
          read_at: string | null;
          read_by: string | null;
          reason: string;
          score: number;
          threshold: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_error?: string | null;
          email_sent_at?: string | null;
          email_status?: string;
          id?: string;
          listing_id: string;
          read_at?: string | null;
          read_by?: string | null;
          reason?: string;
          score: number;
          threshold: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          email_error?: string | null;
          email_sent_at?: string | null;
          email_status?: string;
          id?: string;
          listing_id?: string;
          read_at?: string | null;
          read_by?: string | null;
          reason?: string;
          score?: number;
          threshold?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_alerts_read_by_fkey";
            columns: ["read_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_alerts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_alerts_workspace_id_listing_id_fkey";
            columns: ["workspace_id", "listing_id"];
            isOneToOne: true;
            referencedRelation: "h4a_listings";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      h4a_buy_boxes: {
        Row: {
          alert_threshold: number;
          cities: string[];
          created_at: string;
          max_price_per_unit: number | null;
          notes: string | null;
          price_max: number | null;
          price_min: number | null;
          property_types: string[];
          submarkets: string[];
          units_max: number | null;
          units_min: number | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
          workspace_id: string;
          year_built_max: number | null;
          year_built_min: number | null;
          zips: string[];
        };
        ComputedFields: never;
        Insert: {
          alert_threshold?: number;
          cities?: string[];
          created_at?: string;
          max_price_per_unit?: number | null;
          notes?: string | null;
          price_max?: number | null;
          price_min?: number | null;
          property_types?: string[];
          submarkets?: string[];
          units_max?: number | null;
          units_min?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          workspace_id: string;
          year_built_max?: number | null;
          year_built_min?: number | null;
          zips?: string[];
        };
        Update: {
          alert_threshold?: number;
          cities?: string[];
          created_at?: string;
          max_price_per_unit?: number | null;
          notes?: string | null;
          price_max?: number | null;
          price_min?: number | null;
          property_types?: string[];
          submarkets?: string[];
          units_max?: number | null;
          units_min?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          workspace_id?: string;
          year_built_max?: number | null;
          year_built_min?: number | null;
          zips?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "h4a_buy_boxes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_buy_boxes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      h4a_comps: {
        Row: {
          address: string;
          as_of: string;
          building_sqft: number | null;
          cap_rate: number | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          distance_miles: number | null;
          id: string;
          kind: string;
          monthly_rent: number | null;
          notes: string | null;
          price: number | null;
          price_per_unit: number | null;
          property_id: string;
          sale_date: string | null;
          source_label: string;
          source_url: string | null;
          unit_type: string | null;
          units: number | null;
          updated_at: string;
          workspace_id: string;
          year_built: number | null;
          zip: string | null;
        };
        ComputedFields: never;
        Insert: {
          address: string;
          as_of: string;
          building_sqft?: number | null;
          cap_rate?: number | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          distance_miles?: number | null;
          id?: string;
          kind: string;
          monthly_rent?: number | null;
          notes?: string | null;
          price?: number | null;
          price_per_unit?: never;
          property_id: string;
          sale_date?: string | null;
          source_label: string;
          source_url?: string | null;
          unit_type?: string | null;
          units?: number | null;
          updated_at?: string;
          workspace_id: string;
          year_built?: number | null;
          zip?: string | null;
        };
        Update: {
          address?: string;
          as_of?: string;
          building_sqft?: number | null;
          cap_rate?: number | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          distance_miles?: number | null;
          id?: string;
          kind?: string;
          monthly_rent?: number | null;
          notes?: string | null;
          price?: number | null;
          price_per_unit?: never;
          property_id?: string;
          sale_date?: string | null;
          source_label?: string;
          source_url?: string | null;
          unit_type?: string | null;
          units?: number | null;
          updated_at?: string;
          workspace_id?: string;
          year_built?: number | null;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_comps_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_comps_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_comps_workspace_id_property_id_fkey";
            columns: ["workspace_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      h4a_imports: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          created_count: number;
          error_count: number;
          errors: NonNullable<Json>;
          filename: string | null;
          id: string;
          mapping: NonNullable<Json>;
          status: string;
          total_rows: number;
          unchanged_count: number;
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
          error_count?: number;
          errors?: NonNullable<Json>;
          filename?: string | null;
          id?: string;
          mapping?: NonNullable<Json>;
          status?: string;
          total_rows?: number;
          unchanged_count?: number;
          updated_at?: string;
          updated_count?: number;
          workspace_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_count?: number;
          error_count?: number;
          errors?: NonNullable<Json>;
          filename?: string | null;
          id?: string;
          mapping?: NonNullable<Json>;
          status?: string;
          total_rows?: number;
          unchanged_count?: number;
          updated_at?: string;
          updated_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_imports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_imports_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      h4a_inbound_addresses: {
        Row: {
          created_at: string;
          created_by: string | null;
          token_hash: string;
          token_hint: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          token_hash: string;
          token_hint: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          token_hash?: string;
          token_hint?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_inbound_addresses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_inbound_addresses_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      h4a_inbound_emails: {
        Row: {
          attempts: number;
          body_status: string;
          channel: string;
          confidence: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          from_address: string | null;
          html_body: string | null;
          id: string;
          listing_count: number;
          message_id: string | null;
          parse_notes: NonNullable<Json>;
          parse_status: string;
          parser_key: string | null;
          parser_label: string | null;
          provider_email_id: string | null;
          received_at: string;
          subject: string | null;
          text_body: string | null;
          to_addresses: string[];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          body_status?: string;
          channel: string;
          confidence?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          from_address?: string | null;
          html_body?: string | null;
          id?: string;
          listing_count?: number;
          message_id?: string | null;
          parse_notes?: NonNullable<Json>;
          parse_status?: string;
          parser_key?: string | null;
          parser_label?: string | null;
          provider_email_id?: string | null;
          received_at?: string;
          subject?: string | null;
          text_body?: string | null;
          to_addresses?: string[];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          body_status?: string;
          channel?: string;
          confidence?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          from_address?: string | null;
          html_body?: string | null;
          id?: string;
          listing_count?: number;
          message_id?: string | null;
          parse_notes?: NonNullable<Json>;
          parse_status?: string;
          parser_key?: string | null;
          parser_label?: string | null;
          provider_email_id?: string | null;
          received_at?: string;
          subject?: string | null;
          text_body?: string | null;
          to_addresses?: string[];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_inbound_emails_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_inbound_emails_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      h4a_listing_events: {
        Row: {
          actor_id: string | null;
          changes: NonNullable<Json>;
          created_at: string;
          email_id: string | null;
          id: string;
          kind: string;
          listing_id: string;
          origin: string | null;
          source_label: string | null;
          summary: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          changes?: NonNullable<Json>;
          created_at?: string;
          email_id?: string | null;
          id?: string;
          kind: string;
          listing_id: string;
          origin?: string | null;
          source_label?: string | null;
          summary?: string | null;
          workspace_id: string;
        };
        Update: {
          actor_id?: string | null;
          changes?: NonNullable<Json>;
          created_at?: string;
          email_id?: string | null;
          id?: string;
          kind?: string;
          listing_id?: string;
          origin?: string | null;
          source_label?: string | null;
          summary?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_listing_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listing_events_workspace_id_email_id_fkey";
            columns: ["workspace_id", "email_id"];
            isOneToOne: false;
            referencedRelation: "h4a_inbound_emails";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "h4a_listing_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listing_events_workspace_id_listing_id_fkey";
            columns: ["workspace_id", "listing_id"];
            isOneToOne: false;
            referencedRelation: "h4a_listings";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      h4a_listings: {
        Row: {
          address: string;
          apn: string | null;
          apn_key: string | null;
          broker_company: string | null;
          broker_email: string | null;
          broker_name: string | null;
          broker_phone: string | null;
          building_sqft: number | null;
          cap_rate: number | null;
          city: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          dismissed_at: string | null;
          dismissed_by: string | null;
          dismissed_reason: string | null;
          field_sources: NonNullable<Json>;
          id: string;
          last_received_at: string;
          listing_url: string | null;
          lot_sqft: number | null;
          match_keys: string[];
          origin: string;
          parse_confidence: string | null;
          price: number | null;
          price_per_unit: number | null;
          promoted_at: string | null;
          promoted_by: string | null;
          property_id: string | null;
          property_type: string | null;
          received_at: string;
          review_reasons: string[];
          score: number | null;
          score_breakdown: NonNullable<Json>;
          scored_at: string | null;
          scored_buy_box_version: number | null;
          search_text: string;
          source_label: string;
          state: string;
          status: string;
          street_key: string;
          submarket: string | null;
          units: number | null;
          updated_at: string;
          verification_note: string | null;
          verification_source: string | null;
          verification_status: string;
          verified_at: string | null;
          verified_by: string | null;
          workspace_id: string;
          year_built: number | null;
          zip: string | null;
        };
        ComputedFields: never;
        Insert: {
          address: string;
          apn?: string | null;
          apn_key?: string | null;
          broker_company?: string | null;
          broker_email?: string | null;
          broker_name?: string | null;
          broker_phone?: string | null;
          building_sqft?: number | null;
          cap_rate?: number | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          dismissed_at?: string | null;
          dismissed_by?: string | null;
          dismissed_reason?: string | null;
          field_sources?: NonNullable<Json>;
          id?: string;
          last_received_at?: string;
          listing_url?: string | null;
          lot_sqft?: number | null;
          match_keys?: string[];
          origin: string;
          parse_confidence?: string | null;
          price?: number | null;
          price_per_unit?: never;
          promoted_at?: string | null;
          promoted_by?: string | null;
          property_id?: string | null;
          property_type?: string | null;
          received_at?: string;
          review_reasons?: string[];
          score?: number | null;
          score_breakdown?: NonNullable<Json>;
          scored_at?: string | null;
          scored_buy_box_version?: number | null;
          search_text?: string;
          source_label: string;
          state?: string;
          status?: string;
          street_key: string;
          submarket?: string | null;
          units?: number | null;
          updated_at?: string;
          verification_note?: string | null;
          verification_source?: string | null;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          workspace_id: string;
          year_built?: number | null;
          zip?: string | null;
        };
        Update: {
          address?: string;
          apn?: string | null;
          apn_key?: string | null;
          broker_company?: string | null;
          broker_email?: string | null;
          broker_name?: string | null;
          broker_phone?: string | null;
          building_sqft?: number | null;
          cap_rate?: number | null;
          city?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          dismissed_at?: string | null;
          dismissed_by?: string | null;
          dismissed_reason?: string | null;
          field_sources?: NonNullable<Json>;
          id?: string;
          last_received_at?: string;
          listing_url?: string | null;
          lot_sqft?: number | null;
          match_keys?: string[];
          origin?: string;
          parse_confidence?: string | null;
          price?: number | null;
          price_per_unit?: never;
          promoted_at?: string | null;
          promoted_by?: string | null;
          property_id?: string | null;
          property_type?: string | null;
          received_at?: string;
          review_reasons?: string[];
          score?: number | null;
          score_breakdown?: NonNullable<Json>;
          scored_at?: string | null;
          scored_buy_box_version?: number | null;
          search_text?: string;
          source_label?: string;
          state?: string;
          status?: string;
          street_key?: string;
          submarket?: string | null;
          units?: number | null;
          updated_at?: string;
          verification_note?: string | null;
          verification_source?: string | null;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          workspace_id?: string;
          year_built?: number | null;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_listings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listings_dismissed_by_fkey";
            columns: ["dismissed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listings_promoted_by_fkey";
            columns: ["promoted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listings_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listings_workspace_id_deal_id_fkey";
            columns: ["workspace_id", "deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "h4a_listings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_listings_workspace_id_property_id_fkey";
            columns: ["workspace_id", "property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      h4a_underwriting: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          input_sources: NonNullable<Json>;
          inputs: NonNullable<Json>;
          name: string;
          notes: string | null;
          property_id: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          input_sources?: NonNullable<Json>;
          inputs?: NonNullable<Json>;
          name: string;
          notes?: string | null;
          property_id: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          input_sources?: NonNullable<Json>;
          inputs?: NonNullable<Json>;
          name?: string;
          notes?: string | null;
          property_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "h4a_underwriting_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_underwriting_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_underwriting_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "h4a_underwriting_workspace_id_property_id_fkey";
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
      newsletter_sends: {
        Row: {
          blocked_reasons: string[];
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          email: string;
          error: string | null;
          id: string;
          newsletter_id: string;
          provider_message_id: string | null;
          sent_at: string | null;
          status: string;
          unsubscribe_token: string;
          unsubscribed_at: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_reasons?: string[];
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email: string;
          error?: string | null;
          id?: string;
          newsletter_id: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
          workspace_id: string;
        };
        Update: {
          blocked_reasons?: string[];
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          error?: string | null;
          id?: string;
          newsletter_id?: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "newsletter_sends_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "newsletter_sends_workspace_id_contact_id_fkey";
            columns: ["workspace_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "newsletter_sends_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "newsletter_sends_workspace_id_newsletter_id_fkey";
            columns: ["workspace_id", "newsletter_id"];
            isOneToOne: false;
            referencedRelation: "newsletters";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      newsletters: {
        Row: {
          audience: NonNullable<Json>;
          blocked_count: number;
          body: string;
          created_at: string;
          created_by: string | null;
          failed_count: number;
          id: string;
          preheader: string | null;
          recipient_count: number;
          sent_at: string | null;
          sent_by: string | null;
          sent_count: number;
          status: string;
          subject: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          audience?: NonNullable<Json>;
          blocked_count?: number;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          preheader?: string | null;
          recipient_count?: number;
          sent_at?: string | null;
          sent_by?: string | null;
          sent_count?: number;
          status?: string;
          subject: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          audience?: NonNullable<Json>;
          blocked_count?: number;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          preheader?: string | null;
          recipient_count?: number;
          sent_at?: string | null;
          sent_by?: string | null;
          sent_count?: number;
          status?: string;
          subject?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "newsletters_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "newsletters_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "newsletters_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "newsletters_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_settings: {
        Row: {
          created_at: string;
          from_email: string | null;
          mailing_address: string | null;
          reply_to: string | null;
          sender_name: string | null;
          sms_send_from: number;
          sms_send_until: number;
          time_zone: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          from_email?: string | null;
          mailing_address?: string | null;
          reply_to?: string | null;
          sender_name?: string | null;
          sms_send_from?: number;
          sms_send_until?: number;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          from_email?: string | null;
          mailing_address?: string | null;
          reply_to?: string | null;
          sender_name?: string | null;
          sms_send_from?: number;
          sms_send_until?: number;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_settings_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_suppressions: {
        Row: {
          channel: string;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          reason: string;
          value: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          reason: string;
          value: string;
          workspace_id: string;
        };
        Update: {
          channel?: string;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          reason?: string;
          value?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_suppressions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_suppressions_workspace_id_contact_id_fkey";
            columns: ["workspace_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "outreach_suppressions_workspace_id_fkey";
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
      azh_duplicate_estimate: {
        Args: { p_estimate_id: string };
        Returns: {
          accepted_on: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          declined_on: string | null;
          id: string;
          markup_amount: number;
          markup_pct: number;
          notes: string | null;
          revised_from: string | null;
          sent_on: string | null;
          status: string;
          subtotal: number;
          tax_amount: number;
          tax_pct: number;
          title: string;
          total: number;
          updated_at: string;
          valid_until: string | null;
          version: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "azh_estimates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      azh_issue_upload_tickets: {
        Args: { p_client_key?: string; p_files: Json; p_phone: string; p_slug: string };
        Returns: {
          path: string;
        }[];
      };
      azh_public_form: {
        Args: { p_slug: string };
        Returns: {
          brand: Json;
          name: string;
          service_types: string[];
          workspace_id: string;
        }[];
      };
      azh_replace_fallbrook_zips: {
        Args: { p_workspace_id: string; p_zips: string[] };
        Returns: number;
      };
      azh_save_estimate: {
        Args: {
          p_estimate_id: string;
          p_items: Json;
          p_markup_pct: number;
          p_notes?: string;
          p_tax_pct: number;
          p_title: string;
          p_valid_until?: string;
        };
        Returns: {
          accepted_on: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          declined_on: string | null;
          id: string;
          markup_amount: number;
          markup_pct: number;
          notes: string | null;
          revised_from: string | null;
          sent_on: string | null;
          status: string;
          subtotal: number;
          tax_amount: number;
          tax_pct: number;
          title: string;
          total: number;
          updated_at: string;
          valid_until: string | null;
          version: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "azh_estimates";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      azh_unused_intake_photos: {
        Args: { p_workspace_id: string };
        Returns: {
          name: string;
        }[];
      };
      contact_facets: { Args: { p_workspace_id: string }; Returns: Json };
      contacts_bulk_tag: {
        Args: {
          p_add: string[];
          p_contact_ids: string[];
          p_remove: string[];
          p_workspace_id: string;
        };
        Returns: number;
      };
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
      h4a_create_email: { Args: { p_email: Json; p_workspace_id: string }; Returns: string };
      h4a_inbound_ingest: {
        Args: { p_email_id: string; p_items: Json; p_token: string };
        Returns: Json;
      };
      h4a_inbound_receive: { Args: { p_email: Json; p_token: string }; Returns: Json };
      h4a_inbound_save_scores: {
        Args: { p_email_id: string; p_email_status?: string; p_scores: Json; p_token: string };
        Returns: Json;
      };
      h4a_inbound_set_alert_email_status: {
        Args: { p_alert_id: string; p_error?: string; p_status: string; p_token: string };
        Returns: undefined;
      };
      h4a_inbound_update_email: {
        Args: { p_email_id: string; p_patch: Json; p_token: string };
        Returns: undefined;
      };
      h4a_ingest_listings: {
        Args: { p_email_id?: string; p_items: Json; p_workspace_id: string };
        Returns: Json;
      };
      h4a_mark_alerts_read: {
        Args: { p_alert_ids?: string[]; p_workspace_id: string };
        Returns: number;
      };
      h4a_promote_listing: {
        Args: { p_listing_id: string; p_property_id?: string; p_workspace_id: string };
        Returns: Json;
      };
      h4a_save_scores: {
        Args: {
          p_alertable?: string[];
          p_email_status?: string;
          p_scores: Json;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      h4a_set_alert_email_status: {
        Args: { p_alert_id: string; p_error?: string; p_status: string; p_workspace_id: string };
        Returns: undefined;
      };
      h4a_set_listing_status: {
        Args: { p_action: string; p_listing_id: string; p_reason?: string; p_workspace_id: string };
        Returns: string;
      };
      h4a_update_email: {
        Args: { p_email_id: string; p_patch: Json; p_workspace_id: string };
        Returns: undefined;
      };
      h4a_verify_listing: {
        Args: {
          p_listing_id: string;
          p_note?: string;
          p_source?: string;
          p_status: string;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      outreach_unsubscribe: {
        Args: { p_token: string };
        Returns: {
          email_hint: string;
          workspace_name: string;
        }[];
      };
      outreach_unsubscribe_info: {
        Args: { p_token: string };
        Returns: {
          email_hint: string;
          unsubscribed: boolean;
          workspace_name: string;
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
