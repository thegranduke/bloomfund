import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { claimId, payoutAmount } = await request.json()
    
    // Validate input
    if (!claimId || !payoutAmount) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing claimId or payoutAmount' 
      }, { status: 400 })
    }

    // Environment check
    const required = ['BLOCKDAG_RPC_URL', 'PRIVATE_KEY', 'NEXT_PUBLIC_CONTRACT_ADDRESS', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
    for (const env of required) {
      if (!process.env[env]) {
        return NextResponse.json({ 
          success: false, 
          error: `Missing environment variable: ${env}` 
        }, { status: 500 })
      }
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Update database first
    const { error: dbError } = await supabase
      .from('claims')
      .update({
        status: 'approved',
        payout_amount: payoutAmount,
        claim_start_date: new Date().toISOString()
      })
      .eq('id', claimId)

    if (dbError) {
      return NextResponse.json({ 
        success: false, 
        error: `Database update failed: ${dbError.message}` 
      }, { status: 500 })
    }

    // Call smart contract
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
    const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
      ['function approveClaim(uint256 claimId, uint256 payoutAmount) external'],
      adminWallet
    )

    // Convert payout amount to wei (assuming 1 Rand = 0.001 BDG for testing)
    const payoutAmountWei = ethers.parseEther((payoutAmount * 0.001).toString())
    
    const tx = await contract.approveClaim(claimId, payoutAmountWei)
    await tx.wait()

    return NextResponse.json({ 
      success: true, 
      message: 'Claim approved successfully',
      transactionHash: tx.hash
    })

  } catch (error: any) {
    console.error('Claim approval error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
