export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type WaitlistStatus = "requested" | "contacted" | "invited" | "activated" | "archived"
export type CvmInstanceState = "provisioning" | "ready" | "degraded" | "retired"
export type ModelBackendMode = "local" | "remote" | "hybrid"

export type WaitlistRequestRow = {
  id: string
  created_at: string
  email: string
  company: string | null
  use_case: string | null
  status: WaitlistStatus
  notes: string | null
  priority: number | null
  last_contacted_at: string | null
  supabase_user_id: string | null
  activation_sent_at: string | null
  activation_link: string | null
  activated_at: string | null
  metadata: Json | null
}

export type CvmInstanceRow = {
  id: string
  created_at: string
  updated_at: string
  slug: string
  base_url: string
  state: CvmInstanceState
  provider: string
  attestation_policy: Json
  atlas_policy: Json | null
  atlas_proxy_url: string | null
  endpoint_metadata: Json | null
  last_heartbeat_at: string | null
  retired_at: string | null
}

export type UserCvmAssignmentRow = {
  user_id: string
  cvm_instance_id: string
  created_at: string
  updated_at: string
}

export type UserModelBackendRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  mode: ModelBackendMode
  remote_provider: string | null
  remote_model: string | null
  remote_base_url: string | null
  enabled: boolean
  metadata: Json | null
}

export type UserPasskeyRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  credential_id_b64url: string
  public_key_cose_b64url: string
  user_handle_hash: string | null
  metadata: Json | null
}

export type Database = {
  public: {
    Tables: {
      waitlist_requests: {
        Row: WaitlistRequestRow
        Insert: Partial<Omit<WaitlistRequestRow, "id" | "created_at">> & {
          email: string
        }
        Update: Partial<Omit<WaitlistRequestRow, "id">>
      }
      cvm_instances: {
        Row: CvmInstanceRow
        Insert: Partial<Omit<CvmInstanceRow, "id" | "created_at" | "updated_at">> & {
          slug: string
          base_url: string
        }
        Update: Partial<Omit<CvmInstanceRow, "id" | "created_at">>
      }
      user_cvm_assignments: {
        Row: UserCvmAssignmentRow
        Insert: {
          user_id: string
          cvm_instance_id: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<UserCvmAssignmentRow, "user_id">>
      }
      user_model_backends: {
        Row: UserModelBackendRow
        Insert: Partial<Omit<UserModelBackendRow, "id" | "created_at" | "updated_at">> & {
          user_id: string
        }
        Update: Partial<Omit<UserModelBackendRow, "id" | "created_at">>
      }
      user_passkeys: {
        Row: UserPasskeyRow
        Insert: Partial<Omit<UserPasskeyRow, "id" | "created_at" | "updated_at">> & {
          user_id: string
          credential_id_b64url: string
          public_key_cose_b64url: string
        }
        Update: Partial<Omit<UserPasskeyRow, "id" | "created_at">>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      waitlist_status: WaitlistStatus
      cvm_instance_state: CvmInstanceState
      model_backend_mode: ModelBackendMode
    }
  }
}

export type Tables = Database["public"]["Tables"]
