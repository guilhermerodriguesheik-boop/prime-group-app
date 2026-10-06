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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string
          active: boolean
          created_at: string
          currency: string
          external_id: string | null
          id: string
          institution: string | null
          name: string
          opening_balance: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_type?: string
          active?: boolean
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          institution?: string | null
          name: string
          opening_balance?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_type?: string
          active?: boolean
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          institution?: string | null
          name?: string
          opening_balance?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: number
          record_id: string | null
          table_name: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: number
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: number
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          account_id: string | null
          active: boolean
          closing_day: number | null
          created_at: string
          credit_limit: number | null
          due_day: number | null
          external_id: string | null
          id: string
          issuer: string | null
          last4: string | null
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          closing_day?: number | null
          created_at?: string
          credit_limit?: number | null
          due_day?: number | null
          external_id?: string | null
          id?: string
          issuer?: string | null
          last4?: string | null
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          closing_day?: number | null
          created_at?: string
          credit_limit?: number | null
          due_day?: number | null
          external_id?: string | null
          id?: string
          issuer?: string | null
          last4?: string | null
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          parent_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cte_documents: {
        Row: {
          access_key: string | null
          created_at: string
          external_id: string | null
          id: string
          issued_at: string | null
          number: string | null
          recipient_name: string | null
          sender_name: string | null
          series: string | null
          source: string
          status: string | null
          total_value: number | null
          trip_id: string | null
          workspace_id: string
          xml_path: string | null
        }
        Insert: {
          access_key?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          series?: string | null
          source?: string
          status?: string | null
          total_value?: number | null
          trip_id?: string | null
          workspace_id: string
          xml_path?: string | null
        }
        Update: {
          access_key?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          series?: string | null
          source?: string
          status?: string | null
          total_value?: number | null
          trip_id?: string | null
          workspace_id?: string
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cte_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cte_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          document_type: string | null
          filename: string
          id: string
          metadata: Json
          mime_type: string | null
          related_id: string | null
          related_table: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          filename: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_type?: string | null
          filename?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          active: boolean
          created_at: string
          document: string | null
          id: string
          license_expires_on: string | null
          license_number: string | null
          name: string
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          document?: string | null
          id?: string
          license_expires_on?: string | null
          license_number?: string | null
          name: string
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          document?: string | null
          id?: string
          license_expires_on?: string | null
          license_number?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      external_events: {
        Row: {
          error_message: string | null
          event_type: string | null
          external_id: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_type?: string | null
          external_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_type?: string | null
          external_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          created_at: string
          fueled_at: string
          id: string
          liters: number
          odometer_km: number | null
          station: string | null
          total_amount: number
          transaction_id: string | null
          trip_id: string | null
          vehicle_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          fueled_at?: string
          id?: string
          liters: number
          odometer_km?: number | null
          station?: string | null
          total_amount: number
          transaction_id?: string | null
          trip_id?: string | null
          vehicle_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          fueled_at?: string
          id?: string
          liters?: number
          odometer_km?: number | null
          station?: string | null
          total_amount?: number
          transaction_id?: string | null
          trip_id?: string | null
          vehicle_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          config: Json
          created_at: string
          external_account_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          external_id: string | null
          id: string
          occurred_at: string
          source: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          source?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          external_id?: string | null
          id?: string
          occurred_at?: string
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          created_at: string
          credit: number
          debit: number
          id: string
          journal_entry_id: string
          ledger_account_id: string
          memo: string | null
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id: string
          ledger_account_id: string
          memo?: string | null
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string
          ledger_account_id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          active: boolean
          class: string
          code: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          class: string
          code: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          class?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_installments: {
        Row: {
          created_at: string
          due_date: string
          fees_due: number
          id: string
          installment_number: number
          interest_due: number
          loan_id: string
          paid_amount: number
          principal_due: number
          status: string
        }
        Insert: {
          created_at?: string
          due_date: string
          fees_due?: number
          id?: string
          installment_number: number
          interest_due?: number
          loan_id: string
          paid_amount?: number
          principal_due?: number
          status?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          fees_due?: number
          id?: string
          installment_number?: number
          interest_due?: number
          loan_id?: string
          paid_amount?: number
          principal_due?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          fees_amount: number
          id: string
          installment_id: string | null
          interest_amount: number
          loan_id: string
          notes: string | null
          paid_at: string
          principal_amount: number
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          fees_amount?: number
          id?: string
          installment_id?: string | null
          interest_amount?: number
          loan_id: string
          notes?: string | null
          paid_at?: string
          principal_amount?: number
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          fees_amount?: number
          id?: string
          installment_id?: string | null
          interest_amount?: number
          loan_id?: string
          notes?: string | null
          paid_at?: string
          principal_amount?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "loan_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          annual_rate: number | null
          counterparty_id: string
          created_at: string
          direction: string
          fixed_interest: number | null
          id: string
          installment_frequency: string | null
          interest_type: string
          maturity_date: string | null
          notes: string | null
          periodic_rate: number | null
          principal: number
          rate_period: string | null
          start_date: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          annual_rate?: number | null
          counterparty_id: string
          created_at?: string
          direction?: string
          fixed_interest?: number | null
          id?: string
          installment_frequency?: string | null
          interest_type: string
          maturity_date?: string | null
          notes?: string | null
          periodic_rate?: number | null
          principal: number
          rate_period?: string | null
          start_date: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          annual_rate?: number | null
          counterparty_id?: string
          created_at?: string
          direction?: string
          fixed_interest?: number | null
          id?: string
          installment_frequency?: string | null
          interest_type?: string
          maturity_date?: string | null
          notes?: string | null
          periodic_rate?: number | null
          principal?: number
          rate_period?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          next_due_date: string | null
          next_due_km: number | null
          odometer_km: number | null
          performed_at: string
          transaction_id: string | null
          vehicle_id: string
          vendor_id: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          next_due_date?: string | null
          next_due_km?: number | null
          odometer_km?: number | null
          performed_at?: string
          transaction_id?: string | null
          vehicle_id: string
          vendor_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          next_due_date?: string | null
          next_due_km?: number | null
          odometer_km?: number | null
          performed_at?: string
          transaction_id?: string | null
          vehicle_id?: string
          vendor_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          amount: number
          category_id: string | null
          counterparty_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          paid_amount: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_amount?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_amount?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receivables: {
        Row: {
          amount: number
          category_id: string | null
          counterparty_id: string | null
          created_at: string
          description: string
          due_date: string
          external_id: string | null
          id: string
          received_amount: number
          source: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          description: string
          due_date: string
          external_id?: string | null
          id?: string
          received_amount?: number
          source?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          external_id?: string | null
          id?: string
          received_amount?: number
          source?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_matches: {
        Row: {
          confidence: number | null
          confirmed_at: string | null
          created_at: string
          id: string
          matched_id: string
          matched_table: string
          status: string
          transaction_id: string
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          matched_id: string
          matched_table: string
          status?: string
          transaction_id: string
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          matched_id?: string
          matched_table?: string
          status?: string
          transaction_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_matches_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_matches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_entries: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          due_day: number | null
          ends_on: string | null
          frequency: string
          id: string
          name: string
          starts_on: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          frequency: string
          id?: string
          name: string
          starts_on?: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          frequency?: string
          id?: string
          name?: string
          starts_on?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tolls: {
        Row: {
          amount: number
          created_at: string
          id: string
          occurred_at: string
          plaza: string | null
          transaction_id: string | null
          trip_id: string | null
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          occurred_at?: string
          plaza?: string | null
          transaction_id?: string | null
          trip_id?: string | null
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          occurred_at?: string
          plaza?: string | null
          transaction_id?: string | null
          trip_id?: string | null
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tolls_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolls_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolls_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tolls_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          card_id: string | null
          category_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          external_id: string | null
          id: string
          journal_entry_id: string | null
          metadata: Json
          occurred_at: string
          source: string
          status: string
          transfer_pair_id: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          card_id?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          journal_entry_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          status?: string
          transfer_pair_id?: string | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          card_id?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          external_id?: string | null
          id?: string
          journal_entry_id?: string | null
          metadata?: Json
          occurred_at?: string
          source?: string
          status?: string
          transfer_pair_id?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_pair_id_fkey"
            columns: ["transfer_pair_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          customer_id: string | null
          destination: string | null
          distance_km: number | null
          driver_id: string | null
          ended_at: string | null
          freight_revenue: number
          id: string
          origin: string | null
          reference: string | null
          started_at: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          destination?: string | null
          distance_km?: number | null
          driver_id?: string | null
          ended_at?: string | null
          freight_revenue?: number
          id?: string
          origin?: string | null
          reference?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          destination?: string | null
          distance_km?: number | null
          driver_id?: string | null
          ended_at?: string | null
          freight_revenue?: number
          id?: string
          origin?: string | null
          reference?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          acquisition_value: number | null
          created_at: string
          estimated_value: number | null
          fuel_type: string | null
          id: string
          make: string | null
          model: string | null
          nickname: string
          odometer_km: number | null
          plate: string | null
          status: string
          updated_at: string
          workspace_id: string
          year: number | null
        }
        Insert: {
          acquisition_value?: number | null
          created_at?: string
          estimated_value?: number | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          nickname: string
          odometer_km?: number | null
          plate?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
          year?: number | null
        }
        Update: {
          acquisition_value?: number | null
          created_at?: string
          estimated_value?: number | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          model?: string | null
          nickname?: string
          odometer_km?: number | null
          plate?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_events: {
        Row: {
          body: string | null
          created_at: string
          from_number: string | null
          id: string
          media_id: string | null
          message_type: string | null
          payload: Json
          provider_message_id: string
          status: string
          to_number: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          from_number?: string | null
          id?: string
          media_id?: string | null
          message_type?: string | null
          payload?: Json
          provider_message_id: string
          status?: string
          to_number?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          from_number?: string | null
          id?: string
          media_id?: string | null
          message_type?: string | null
          payload?: Json
          provider_message_id?: string
          status?: string
          to_number?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          currency: string
          id: string
          kind: string
          name: string
          owner_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          kind: string
          name: string
          owner_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_workspace: {
        Args: { target_workspace: string }
        Returns: boolean
      }
      ingest_whatsapp_event: {
        Args: {
          p_body: string
          p_from_number: string
          p_ingress_secret: string
          p_media_id: string
          p_message_type: string
          p_payload: Json
          p_provider_message_id: string
          p_to_number: string
        }
        Returns: string
      }
      is_workspace_member: {
        Args: { target_workspace: string }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
