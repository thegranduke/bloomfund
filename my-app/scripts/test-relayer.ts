import { loadEnvConfig } from '@next/env'
import * as path from 'path'

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

import { ethers } from 'ethers'
import { createClient } from '@supabase/supabase-js'

async function testRelayerPayment() {
  // Debug: Check if environment variables are loaded
  console.log('Environment check:')
  console.log('BLOCKDAG_RPC_URL:', process.env.BLOCKDAG_RPC_URL ? '✅ Set' : '❌ Missing')
  console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? '✅ Set' : '❌ Missing')
  console.log('CONTRACT_ADDRESS:', process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ? '✅ Set' : '❌ Missing')
  console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing')
  console.log('SUPABASE_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing')
  console.log('---')

  // Initialize Supabase client after env vars are loaded
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Connect to BlockDAG
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKDAG_RPC_URL)
  const relayerWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
  
  // Contract instances
  const insuranceContract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    ['function payBatch(tuple(address user, uint256 tier, uint256 amount, uint256 period, uint256 validUntil, uint256 nonce)[] auths, bytes[] signatures)'],
    relayerWallet
  )

  // Get pending users from database
  const { data: users, error } = await supabase
    .from('users')
    .select(`
      *,
      authorizations(*)
    `)
    .eq('is_active', true)

  if (error) {
    console.error('Database error:', error)
    return
  }

  console.log(`Found ${users.length} users to process`)

  // Process each user
  for (const user of users) {
    const auth = user.authorizations[0] // Get latest authorization
    
    try {
      console.log(`Processing payment for ${user.wallet_address}...`)
      
      // Call smart contract
      const tx = await insuranceContract.payBatch(
        [auth.typed_data_json.value], // Authorization data
        [auth.signature] // User signature
      )
      
      console.log(`✅ Payment processed: ${tx.hash}`)
      await tx.wait()
      
      // Update database
      await supabase
        .from('users')
        .update({ last_paid_at: new Date().toISOString() })
        .eq('id', user.id)
        
    } catch (error) {
      console.error(`❌ Payment failed for ${user.wallet_address}:`, error)
    }
  }
}

// Run the test
testRelayerPayment()
  .then(() => console.log('Relayer test complete'))
  .catch(error => console.error('Script failed:', error))