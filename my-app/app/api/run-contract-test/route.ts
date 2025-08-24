import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

// Simple in-API test functions to avoid module resolution issues
async function runComprehensiveTest() {
  const output: string[] = []
  const log = (msg: string) => {
    output.push(msg)
    console.log(msg)
  }

  try {
    log('🚀 Comprehensive Insurance System Test...')
    
    // Environment check
    const required = ['BLOCKDAG_RPC_URL', 'PRIVATE_KEY', 'NEXT_PUBLIC_CONTRACT_ADDRESS']
    for (const env of required) {
      if (!process.env[env]) {
        throw new Error(`Missing: ${env}`)
      }
      log(`${env}: ✅`)
    }

    const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    log(`📡 Admin Wallet: ${wallet.address}`)
    
    const balance = await provider.getBalance(wallet.address)
    log(`💰 Admin Balance: ${ethers.formatEther(balance)} BDG`)

    // Connect to contract
    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
      [
        'function owner() external view returns (address)',
        'function isRelayer(address) external view returns (bool)',
        'function getContractBalance() external view returns (uint256)',
        'function totalPremiumsCollected() external view returns (uint256)',
        'function getTier(uint256 tierId) external view returns (uint256 monthlyFee, uint256 payoutAmount, bool active)'
      ],
      wallet
    )

    log(`📋 Contract: ${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`)

    // Test contract connection
    log('\n🔍 Testing contract connection...')
    const owner = await contract.owner()
    log(`Contract owner: ${owner}`)
    
    const isRelayer = await contract.isRelayer(wallet.address)
    log(`Wallet is relayer: ${isRelayer}`)
    
    const contractBalance = await contract.getContractBalance()
    log(`Contract balance: ${ethers.formatEther(contractBalance)} BDG`)
    
    const totalPremiums = await contract.totalPremiumsCollected()
    log(`Total premiums collected: ${ethers.formatEther(totalPremiums)} BDG`)
    
    // Get tier information
    log('\n📊 Insurance Tiers:')
    for (let i = 1; i <= 3; i++) {
      const tier = await contract.getTier(i)
      log(`Tier ${i}: ${ethers.formatEther(tier.monthlyFee)} BDG/month → ${tier.payoutAmount} Rands`)
    }

    log('\n✅ Contract test completed successfully!')
    return output.join('\n')

  } catch (error: any) {
    log(`\n❌ Test failed: ${error.message}`)
    return output.join('\n')
  }
}

async function runBasicTest() {
  const output: string[] = []
  const log = (msg: string) => {
    output.push(msg)
    console.log(msg)
  }

  try {
    log('🔧 Basic Contract Test...')
    
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
      [
        'function owner() external view returns (address)',
        'function getContractBalance() external view returns (uint256)'
      ],
      provider
    )

    const owner = await contract.owner()
    const balance = await contract.getContractBalance()
    
    log(`Owner: ${owner}`)
    log(`Balance: ${ethers.formatEther(balance)} BDG`)
    log('✅ Basic test completed!')
    
    return output.join('\n')
  } catch (error: any) {
    log(`❌ Basic test failed: ${error.message}`)
    return output.join('\n')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({ script: 'comprehensive-insurance-test.js' }))
    const scriptName = body.script || 'comprehensive-insurance-test.js'
    
    let result: string
    if (scriptName.includes('comprehensive')) {
      result = await runComprehensiveTest()
    } else {
      result = await runBasicTest()
    }

    return NextResponse.json({ 
      success: true,
      output: result 
    })

  } catch (error: any) {
    return NextResponse.json({ 
      success: false,
      output: `❌ Failed to run test: ${error.message}` 
    })
  }
}
