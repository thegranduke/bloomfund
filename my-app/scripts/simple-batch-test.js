const { loadEnvConfig } = require('@next/env')
const path = require('path')

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

const { ethers } = require('ethers')
const { createClient } = require('@supabase/supabase-js')

async function testBatchPayments() {
  console.log('🔄 Starting batch payment test...')
  
  // Environment check
  const required = ['BLOCKDAG_RPC_URL', 'PRIVATE_KEY', 'NEXT_PUBLIC_CONTRACT_ADDRESS', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
  
  for (const env of required) {
    if (!process.env[env]) {
      console.error(`❌ Missing: ${env}`)
      process.exit(1)
    }
    console.log(`${env}: ✅`)
  }

  // Initialize connections
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
  const relayerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  
  console.log(`📡 Relayer: ${relayerWallet.address}`)
  
  // Check balance
  const balance = await provider.getBalance(relayerWallet.address)
  console.log(`💰 Balance: ${ethers.formatEther(balance)} BDG`)

  // Contract setup
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    [
      'function payBatch(tuple(address user, uint256 tier, uint256 amount, uint256 period, uint256 validUntil, uint256 nonce)[] auths, bytes[] signatures) payable',
      'function nonces(address user) view returns (uint256)'
    ],
    relayerWallet
  )

  // Get users from database
  console.log('\n📊 Fetching users...')
  
  const { data: users, error } = await supabase
    .from('users')
    .select(`
      id,
      wallet_address,
      tier,
      monthly_fee,
      last_paid_at,
      is_active,
      authorizations!inner(
        typed_data_json,
        signature,
        is_active
      )
    `)
    .eq('is_active', true)
    .eq('authorizations.is_active', true)
    .limit(5) // Test with max 5 users

  if (error) {
    console.error('❌ Database error:', error)
    return
  }

  console.log(`👥 Found ${users.length} users`)
  
  if (users.length === 0) {
    console.log('ℹ️ No users found. Create some test users first:')
    console.log('  1. Go to /onboarding')
    console.log('  2. Sign up and select a tier')
    return
  }

  // Process users
  const validUsers = []
  
  for (const user of users) {
    const auth = user.authorizations[0]
    
    console.log(`\n👤 ${user.wallet_address}`)
    console.log(`   Tier: ${user.tier}`)
    console.log(`   Fee: ${user.monthly_fee}`)
    
    try {
      // Verify signature
      const typedData = auth.typed_data_json
      const recovered = ethers.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.value,
        auth.signature
      )
      
      if (recovered.toLowerCase() !== user.wallet_address.toLowerCase()) {
        console.log(`   ❌ Invalid signature`)
        continue
      }
      
      // Check nonce
      const onChainNonce = await contract.nonces(user.wallet_address)
      const expectedNonce = BigInt(typedData.value.nonce)
      
      if (expectedNonce !== onChainNonce) {
        console.log(`   ❌ Nonce mismatch: expected ${expectedNonce}, got ${onChainNonce}`)
        continue
      }
      
      console.log(`   ✅ Valid for batch payment`)
      validUsers.push({ user, auth })
      
    } catch (err) {
      console.log(`   ❌ Validation error:`, err.message)
    }
  }

  if (validUsers.length === 0) {
    console.log('\n❌ No valid users for payment')
    return
  }

  // Prepare batch data
  console.log(`\n💳 Preparing batch for ${validUsers.length} users...`)
  
  const auths = []
  const signatures = []
  let totalAmount = BigInt(0)

  for (const { user, auth } of validUsers) {
    const typedData = auth.typed_data_json
    auths.push(typedData.value)
    signatures.push(auth.signature)
    totalAmount += BigInt(typedData.value.amount)
  }

  console.log(`   Total: ${ethers.formatEther(totalAmount)} BDG`)

  // Check relayer has enough balance
  if (balance < totalAmount) {
    console.log(`❌ Insufficient balance: need ${ethers.formatEther(totalAmount)}, have ${ethers.formatEther(balance)}`)
    return
  }

  // Execute batch payment
  console.log(`\n🚀 Executing batch payment...`)
  
  try {
    const tx = await contract.payBatch(auths, signatures, { 
      value: totalAmount 
    })
    
    console.log(`📝 TX: ${tx.hash}`)
    console.log(`⏳ Waiting for confirmation...`)
    
    const receipt = await tx.wait()
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`)
    
    // Update database
    const timestamp = new Date().toISOString()
    
    for (const { user } of validUsers) {
      await supabase
        .from('users')
        .update({ last_paid_at: timestamp })
        .eq('id', user.id)
    }
    
    console.log(`\n🎉 Batch payment successful!`)
    console.log(`   Users: ${validUsers.length}`)
    console.log(`   Amount: ${ethers.formatEther(totalAmount)} BDG`)
    console.log(`   TX: ${tx.hash}`)
    
  } catch (error) {
    console.error(`\n❌ Payment failed:`, error.message)
    
    if (error.data) {
      console.log(`Error data: ${error.data}`)
    }
  }
}

// Run test
testBatchPayments()
  .then(() => console.log('\n✅ Test complete'))
  .catch(err => {
    console.error('\n💥 Test failed:', err)
    process.exit(1)
  })