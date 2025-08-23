import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database types
export interface User {
  id: string
  auth_user_id: string
  wallet_address: string
  tier?: number
  monthly_fee?: number
  period_seconds: number
  valid_until?: string
  nonce: number
  last_paid_at?: string
  total_paid: number
  is_active: boolean
  created_at: string
}

export interface Authorization {
  id: string
  user_id: string
  typed_data_json: any
  signature: string
  is_active: boolean
  created_at: string
}

export interface Claim {
  id: string
  user_id: string
  document_hash: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  payout_amount?: number
  installments_total: number
  installments_paid: number
  claim_start_date?: string
  created_at: string
}

// Test function with auth
export async function testConnectionWithAuth(): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError) {
    console.error('Auth error:', authError)
    return false
  }

  if (user) {
    console.log('Authenticated user:', user.email)
    
    // Test database access
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .eq('auth_user_id', user.id)
    
    if (error) {
      console.error('DB access error:', error)
      return false
    }
    
    console.log('DB access successful!')
    return true
  } else {
    console.log('No authenticated user')
    return false
  }
}

// Helper to get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}