import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

interface RegisterTierRequest {
  walletAddress: string
  typedData: {
    domain: any
    types: any
    value: any
  }
  signature: string
  tier: number
  monthlyFee: number
  payoutAmount: number
}

export async function POST(request: NextRequest) {
  // Get authenticated user from request
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'No auth token' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 })
  }

  const body: RegisterTierRequest = await request.json()
  const { walletAddress, typedData, signature, tier, monthlyFee, payoutAmount } = body

  if (!walletAddress || !signature || !tier) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const address = walletAddress.toLowerCase()
    const validUntil = new Date(typedData.value.validUntil * 1000)

    // Update user record with tier info (linked to authenticated user)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({
        auth_user_id: user.id,
        wallet_address: address,
        tier,
        monthly_fee: monthlyFee,
        valid_until: validUntil,
        nonce: typedData.value.nonce,
        is_active: true
      }, {
        onConflict: 'auth_user_id'
      })
      .select('id')
      .single()

    if (userError) throw userError

    // Store authorization signature
    const { error: authError } = await supabase
      .from('authorizations')
      .insert({
        user_id: userData.id,
        typed_data_json: typedData,
        signature,
        is_active: true
      })

    if (authError) throw authError

    console.log(`User ${user.email} (${address}) registered for tier ${tier}`)
    return NextResponse.json({ success: true, message: 'Registration successful' })

  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Registration failed: ' + error.message }, { status: 500 })
  }
}