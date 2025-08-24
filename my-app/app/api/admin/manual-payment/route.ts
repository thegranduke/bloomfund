import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

export async function POST(request: NextRequest) {
  try {
    const { userAddress, amount } = await request.json()
    
    // Validate input
    if (!userAddress || !amount) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing userAddress or amount' 
      }, { status: 400 })
    }

    // Environment check
    const required = ['BLOCKDAG_RPC_URL', 'PRIVATE_KEY']
    for (const env of required) {
      if (!process.env[env]) {
        return NextResponse.json({ 
          success: false, 
          error: `Missing environment variable: ${env}` 
        }, { status: 500 })
      }
    }

    // Send payment
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
    const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    const amountWei = ethers.parseEther(amount)
    
    const tx = await adminWallet.sendTransaction({
      to: userAddress,
      value: amountWei
    })
    
    await tx.wait()

    return NextResponse.json({ 
      success: true, 
      message: `Sent ${amount} BDG to ${userAddress}`,
      transactionHash: tx.hash
    })

  } catch (error: any) {
    console.error('Manual payment error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
