export type ClientStatus = "active" | "paused" | "needs_attention";
export type CampaignStatus = "active" | "paused" | "draft";
export type MessageStatus = "sent" | "failed";

export interface Client {
  id: string;
  name: string;
  business_name: string;
  business_type: string | null;
  phone: string | null;
  group_jid: string;
  group_name: string | null;
  timezone: string;
  status: ClientStatus;
  is_deleted: boolean;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  template_id: string;
  send_day: number;
  send_time: string;
  frequency: "monthly";
  status: CampaignStatus;
  created_at: string;
}

export interface CampaignClient {
  id: string;
  campaign_id: string;
  client_id: string;
  send_day_override: number | null;
  send_time_override: string | null;
  bullmq_job_id: string | null;
}

export interface MessageLog {
  id: string;
  bullmq_job_id: string | null;
  client_id: string;
  campaign_id: string;
  group_jid: string;
  rendered_message: string;
  status: MessageStatus;
  error_message: string | null;
  sent_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Database type — mirrors the structure produced by `supabase gen types`.
// Uses { [_ in never]: never } for empty Views/Functions/Enums (Supabase CLI pattern).
// ─────────────────────────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          business_name: string;
          business_type: string | null;
          phone: string | null;
          group_jid: string;
          group_name: string | null;
          timezone: string;
          status: ClientStatus;
          is_deleted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          business_name: string;
          business_type?: string | null;
          phone?: string | null;
          group_jid: string;
          group_name?: string | null;
          timezone?: string;
          status?: ClientStatus;
          is_deleted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          business_name?: string;
          business_type?: string | null;
          phone?: string | null;
          group_jid?: string;
          group_name?: string | null;
          timezone?: string;
          status?: ClientStatus;
          is_deleted?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          body: string;
          variables: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          body: string;
          variables?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          body?: string;
          variables?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          template_id: string;
          send_day: number;
          send_time: string;
          frequency: "monthly";
          status: CampaignStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          template_id: string;
          send_day: number;
          send_time: string;
          frequency?: "monthly";
          status?: CampaignStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          template_id?: string;
          send_day?: number;
          send_time?: string;
          frequency?: "monthly";
          status?: CampaignStatus;
          created_at?: string;
        };
        Relationships: [];
      };
      campaign_clients: {
        Row: {
          id: string;
          campaign_id: string;
          client_id: string;
          send_day_override: number | null;
          send_time_override: string | null;
          bullmq_job_id: string | null;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          client_id: string;
          send_day_override?: number | null;
          send_time_override?: string | null;
          bullmq_job_id?: string | null;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          client_id?: string;
          send_day_override?: number | null;
          send_time_override?: string | null;
          bullmq_job_id?: string | null;
        };
        Relationships: [];
      };
      message_logs: {
        Row: {
          id: string;
          bullmq_job_id: string | null;
          client_id: string;
          campaign_id: string;
          group_jid: string;
          rendered_message: string;
          status: MessageStatus;
          error_message: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          bullmq_job_id?: string | null;
          client_id: string;
          campaign_id: string;
          group_jid: string;
          rendered_message: string;
          status: MessageStatus;
          error_message?: string | null;
          sent_at?: string;
        };
        Update: {
          id?: string;
          bullmq_job_id?: string | null;
          client_id?: string;
          campaign_id?: string;
          group_jid?: string;
          rendered_message?: string;
          status?: MessageStatus;
          error_message?: string | null;
          sent_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
