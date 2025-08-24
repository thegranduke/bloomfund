import { loadEnvConfig } from '@next/env'
import * as path from 'path'

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'

async function testBatchPayments() {
  console.log('🔄 Starting batch payment test...')
  
  // Environment check
  const requiredEnvs = {
    'BLOCKDAG_RPC_URL': process.env.BLOCKDAG_RPC_URL,
    'PRIVATE_KEY': process.env.PRIVATE_KEY, 
    'CONTRACT_ADDRESS': process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    'SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }

  for (const [key, value] of Object.entries(requiredEnvs)) {
    console.log(`${key}: ${value ? '✅' : '❌'}`)
    if (!value) {
      console.error(`Missing required environment variable: ${key}`)
      process.exit(1)
    }
  }

  // Initialize connections
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
  const relayerWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
  
  console.log(`📡 Relayer address: ${relayerWallet.address}`)
  
  // Check relayer balance
  const balance = await provider.getBalance(relayerWallet.address)
  console.log(`💰 Relayer balance: ${ethers.formatEther(balance)} BDG`)
  
  if (balance === 0n) {
    console.error('❌ Relayer has no balance for gas fees')
    process.exit(1)
  }

  // Smart contract setup
  const CONTRACT_ABI = [
    'function payBatch(tuple(address user, uint256 tier, uint256 amount, uint256 period, uint256 validUntil, uint256 nonce)[] auths, bytes[] signatures) payable',
    'function nonces(address user) view returns (uint256)',
    'function lastPaidAt(address user) view returns (uint256)',
    'function tiers(uint256 tierId) view returns (uint256 monthlyFee, uint256 payoutAmount)',
    'event PaymentProcessed(address indexed user, uint256 tier, uint256 amount)'
  ]
  
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    CONTRACT_ABI,
    relayerWallet
  )

  // Get users ready for payment
  console.log('\n📊 Fetching users ready for payment...')
  
  const { data: users, error } = await supabase
    .from('users')
    .select(`
      id,
      auth_user_id,
      wallet_address,
      tier,
      monthly_fee,
      last_paid_at,
      is_active,
      authorizations!inner(
        id,
        typed_data_json,
        signature,
        is_active,
        created_at
      )
    `)
    .eq('is_active', true)
    .eq('authorizations.is_active', true)
    .order('created_at', { foreignTable: 'authorizations', ascending: false })

  if (error) {
    console.error('❌ Database error:', error)
    process.exit(1)
  }

  console.log(`👥 Found ${users.length} active users`)
  
  if (users.length === 0) {
    console.log('ℹ️ No users found. Make sure you have:')
    console.log('  1. Signed up and connected wallet on /onboarding')
    console.log('  2. Selected an insurance tier')
    console.log('  3. Users have is_active = true in database')
    return
  }

  // Filter users ready for payment (payment period elapsed)
  const now = Math.floor(Date.now() / 1000)
  const PAYMENT_PERIOD = 30 * 24 * 60 * 60 // 30 days in seconds
  
  const readyUsers = []
  
  for (const user of users) {
    const lastPaid = user.last_paid_at ? Math.floor(new Date(user.last_paid_at).getTime() / 1000) : 0
    const timeSinceLastPayment = now - lastPaid
    
    console.log(`\n👤 User: ${user.wallet_address}`)
    console.log(`   Tier: ${user.tier} (${user.monthly_fee} tokens/month)`)
    console.log(`   Last paid: ${user.last_paid_at || 'Never'}`)
    console.log(`   Time since payment: ${Math.floor(timeSinceLastPayment / (24*60*60))} days`)
    
    if (timeSinceLastPayment >= PAYMENT_PERIOD) {
      console.log(`   ✅ Ready for payment`)
      readyUsers.push(user)
    } else {
      const daysRemaining = Math.ceil((PAYMENT_PERIOD - timeSinceLastPayment) / (24*60*60))
      console.log(`   ⏳ ${daysRemaining} days until next payment`)
    }
  }

  if (readyUsers.length === 0) {
    console.log('\n⏳ No users ready for payment at this time')
    console.log('💡 For testing, you can manually set last_paid_at to an old date in the database')
    return
  }

  console.log(`\n💳 Processing payments for ${readyUsers.length} users...`)
  
  // Prepare batch data
  const batchAuths = []
  const batchSignatures = []
  let totalAmount = 0n

  for (const user of readyUsers) {
    const auth = user.authorizations[0]
    const typedData = auth.typed_data_json
    
    console.log(`\n🔍 Validating user ${user.wallet_address}:`)
    
    // Verify signature
    try {
      const recovered = ethers.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.value,
        auth.signature
      )
      
      if (recovered.toLowerCase() !== user.wallet_address.toLowerCase()) {
        console.log(`   ❌ Signature verification failed`)
        continue
      }
      console.log(`   ✅ Signature valid`)
      
      // Check nonce
      const onChainNonce = await contract.nonces(user.wallet_address)
      const expectedNonce = typedData.value.nonce
      
      if (BigInt(expectedNonce) !== onChainNonce) {
        console.log(`   ❌ Nonce mismatch: expected ${expectedNonce}, got ${onChainNonce}`)
        continue
      }
      console.log(`   ✅ Nonce valid: ${expectedNonce}`)
      
      // Add to batch
      batchAuths.push(typedData.value)
      batchSignatures.push(auth.signature)
      totalAmount += BigInt(typedData.value.amount)
      
      console.log(`   ✅ Added to batch (${ethers.formatEther(typedData.value.amount)} BDG)`)
      
    } catch (error) {
      console.log(`   ❌ Validation failed:`, error)
    }
  }

  if (batchAuths.length === 0) {
    console.log('\n❌ No valid payments to process')
    return
  }

  console.log(`\n💰 Batch summary:`)
  console.log(`   Users: ${batchAuths.length}`)
  console.log(`   Total amount: ${ethers.formatEther(totalAmount)} BDG`)
  
  // Check if relayer has enough balance
  if (balance < totalAmount) {
    console.log(`❌ Insufficient relayer balance: need ${ethers.formatEther(totalAmount)}, have ${ethers.formatEther(balance)}`)
    return
  }

  // Execute batch payment
  console.log(`\n🚀 Executing batch payment...`)
  
  try {
    // Estimate gas first
    const gasEstimate = await contract.payBatch.estimateGas(
      batchAuths,
      batchSignatures,
      { value: totalAmount }
    )
    
    console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`)
    
    // Send transaction
    const tx = await contract.payBatch(
      batchAuths,
      batchSignatures,
      { 
        value: totalAmount,
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      }
    )
    
    console.log(`📝 Transaction sent: ${tx.hash}`)
    console.log(`⏳ Waiting for confirmation...`)
    
    const receipt = await tx.wait()
    console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`)
    
    // Update database
    console.log(`\n📝 Updating database...`)
    const timestamp = new Date().toISOString()
    
    for (const user of readyUsers.slice(0, batchAuths.length)) {
      await supabase
        .from('users')
        .update({ 
          last_paid_at: timestamp,
          total_paid: (user.total_paid || 0) + user.monthly_fee
        })
        .eq('id', user.id)
      
      console.log(`   ✅ Updated ${user.wallet_address}`)
    }
    
    console.log(`\n🎉 Batch payment completed successfully!`)
    console.log(`   Transaction: ${tx.hash}`)
    console.log(`   Users processed: ${batchAuths.length}`)
    console.log(`   Total paid: ${ethers.formatEther(totalAmount)} BDG`)
    
  } catch (error: any) {
    console.error(`\n❌ Batch payment failed:`, error)
    
    // Try to decode error
    if (error.data) {
      console.log(`Error data: ${error.data}`)
    }
    
    if (error.reason) {
      console.log(`Reason: ${error.reason}`)
    }
  }
}

// Run the test
testBatchPayments()
  .then(() => console.log('\n✅ Test completed'))
  .catch(error => {
    console.error('\n💥 Test failed:', error)
    process.exit(1)
  })