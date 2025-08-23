import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

interface NonceResponse {
  nonce: number
  walletAddress?: string
}

export async function GET(request: NextRequest) {
  // Get authenticated user from request
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'No auth token' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 })
  }

  try {
    // Get user's nonce
    const { data: userData, error } = await supabase
      .from('users')
      .select('nonce, wallet_address')
      .eq('auth_user_id', user.id)
      .single()

    if (error && error.code === 'PGRST116') {
      // User doesn't exist in users table yet, return nonce 0
      return NextResponse.json({ nonce: 0 })
    }

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      nonce: userData?.nonce || 0,
      walletAddress: userData?.wallet_address 
    })
  } catch (error) {
    console.error('Error getting nonce:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}