import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { claimId } = await request.json()
    
    // Validate input
    if (!claimId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing claimId' 
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

    // Get current claim data
    const { data: claim, error: fetchError } = await supabase
      .from('claims')
      .select('*')
      .eq('id', claimId)
      .single()

    if (fetchError || !claim) {
      return NextResponse.json({ 
        success: false, 
        error: 'Claim not found' 
      }, { status: 404 })
    }

    // Call smart contract
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
    const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
      ['function processInstallment(uint256 claimId) external'],
      adminWallet
    )

    const tx = await contract.processInstallment(claimId)
    await tx.wait()

    // Update database
    const newInstallmentsPaid = (claim.installments_paid || 0) + 1
    const newStatus = newInstallmentsPaid >= 4 ? 'completed' : 'approved'
    
    const { error: updateError } = await supabase
      .from('claims')
      .update({
        installments_paid: newInstallmentsPaid,
        status: newStatus
      })
      .eq('id', claimId)

    if (updateError) {
      return NextResponse.json({ 
        success: false, 
        error: `Database update failed: ${updateError.message}` 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Payout processed successfully',
      transactionHash: tx.hash,
      installmentsPaid: newInstallmentsPaid,
      status: newStatus
    })

  } catch (error: any) {
    console.error('Payout processing error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
