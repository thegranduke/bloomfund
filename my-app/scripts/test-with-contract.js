const { loadEnvConfig } = require('@next/env')
const path = require('path')

// Load Next.js environment configuration
const projectDir = path.join(__dirname, '..')
loadEnvConfig(projectDir)

const { ethers } = require('ethers')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Load the ABI
const CONTRACT_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/MicroInsurance-ABI.json'), 'utf8'))

async function testWithContract() {
  console.log('🚀 Testing MicroInsurance Contract Integration...')
  
  // Environment check
  const required = [
    'BLOCKDAG_RPC_URL',
    'PRIVATE_KEY', 
    'NEXT_PUBLIC_CONTRACT_ADDRESS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]
  
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
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  
  console.log(`📡 Wallet: ${wallet.address}`)
  
  // Check balance
  const balance = await provider.getBalance(wallet.address)
  console.log(`💰 Balance: ${ethers.formatEther(balance)} BDG`)

  // Connect to contract
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    wallet
  )

  console.log(`📋 Contract: ${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`)

  try {
    // Test contract connection
    console.log('\n🔍 Testing contract connection...')
    
    const owner = await contract.owner()
    console.log(`Contract owner: ${owner}`)
    
    const isRelayer = await contract.isRelayer(wallet.address)
    console.log(`Wallet is relayer: ${isRelayer}`)
    
    const contractBalance = await contract.getContractBalance()
    console.log(`Contract balance: ${ethers.formatEther(contractBalance)} BDG`)
    
    // Get tier information
    console.log('\n📊 Insurance Tiers:')
    for (let i = 1; i <= 3; i++) {
      const tier = await contract.getTier(i)
      console.log(`Tier ${i}:`, {
        monthlyFee: ethers.formatEther(tier.monthlyFee),
        payoutAmount: tier.payoutAmount.toString(),
        active: tier.active
      })
    }

    // Get users from database
    console.log('\n👥 Fetching users from database...')
    
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
      .limit(3)

    if (error) {
      console.error('❌ Database error:', error)
      return
    }

    console.log(`Found ${users.length} users`)

    if (users.length === 0) {
      console.log('\n⚠️  No users found. Please:')
      console.log('1. Go to /onboarding')
      console.log('2. Sign up and select a tier')
      console.log('3. Make sure contract is deployed correctly')
      return
    }

    // Test individual user data
    for (const user of users) {
      console.log(`\n👤 Testing user: ${user.wallet_address}`)
      
      // Check on-chain nonce
      const nonce = await contract.nonces(user.wallet_address)
      console.log(`   On-chain nonce: ${nonce}`)
      
      // Check last paid
      const lastPaid = await contract.lastPaidAt(user.wallet_address)
      console.log(`   Last paid on-chain: ${lastPaid} (${lastPaid > 0 ? new Date(Number(lastPaid) * 1000).toISOString() : 'Never'})`)
      
      // Check user policy
      const policy = await contract.getUserPolicy(user.wallet_address)
      console.log(`   Policy:`, {
        tier: policy.tier.toString(),
        lastPaidAt: policy.lastPaidAt.toString(),
        totalPaid: ethers.formatEther(policy.totalPaid),
        active: policy.active
      })

      // Validate signature
      const auth = user.authorizations[0]
      const typedData = auth.typed_data_json
      
      try {
        const recovered = ethers.verifyTypedData(
          typedData.domain,
          typedData.types,
          typedData.value,
          auth.signature
        )
        
        const signatureValid = recovered.toLowerCase() === user.wallet_address.toLowerCase()
        console.log(`   Signature valid: ${signatureValid ? '✅' : '❌'}`)
        
        if (!signatureValid) {
          console.log(`     Expected: ${user.wallet_address}`)
          console.log(`     Recovered: ${recovered}`)
        }
      } catch (err) {
        console.log(`   ❌ Signature validation error:`, err.message)
      }
    }

    // If we have valid users, try a small batch test
    if (users.length > 0 && !isRelayer) {
      console.log('\n⚠️  Wallet is not a relayer. To test batch payments:')
      console.log(`1. Add ${wallet.address} as relayer in contract`)
      console.log(`2. Call contract.addRelayer("${wallet.address}")`)
      return
    }

    if (users.length > 0 && isRelayer) {
      console.log('\n💳 Testing batch payment (DRY RUN)...')
      
      // Prepare batch data
      const auths = []
      const signatures = []
      let totalAmount = BigInt(0)

      for (const user of users.slice(0, 1)) { // Test with 1 user first
        const auth = user.authorizations[0]
        const typedData = auth.typed_data_json
        
        // Check if payment is due (simulate old payment)
        const lastPaid = await contract.lastPaidAt(user.wallet_address)
        const now = Math.floor(Date.now() / 1000)
        const paymentPeriod = 30 * 24 * 60 * 60 // 30 days
        
        if (lastPaid > 0 && now < Number(lastPaid) + paymentPeriod) {
          console.log(`   ⏳ User ${user.wallet_address} payment not due yet`)
          continue
        }

        auths.push(typedData.value)
        signatures.push(auth.signature)
        totalAmount += BigInt(typedData.value.amount)
        
        console.log(`   ✅ Added ${user.wallet_address} to batch`)
      }

      if (auths.length > 0) {
        console.log(`\n🚀 Executing batch payment for ${auths.length} users...`)
        console.log(`   Total amount: ${ethers.formatEther(totalAmount)} BDG`)
        
        // Check if we have enough balance
        if (balance < totalAmount) {
          console.log(`❌ Insufficient balance: need ${ethers.formatEther(totalAmount)}, have ${ethers.formatEther(balance)}`)
          return
        }

        try {
          // Estimate gas first
          const gasEstimate = await contract.payBatch.estimateGas(auths, signatures, { value: totalAmount })
          console.log(`   Gas estimate: ${gasEstimate}`)
          
          // Execute transaction
          const tx = await contract.payBatch(auths, signatures, { 
            value: totalAmount,
            gasLimit: gasEstimate * BigInt(120) / BigInt(100) // 20% buffer
          })
          
          console.log(`   TX sent: ${tx.hash}`)
          console.log(`   ⏳ Waiting for confirmation...`)
          
          const receipt = await tx.wait()
          console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`)
          
          // Update database
          const timestamp = new Date().toISOString()
          for (const user of users.slice(0, auths.length)) {
            await supabase
              .from('users')
              .update({ last_paid_at: timestamp })
              .eq('id', user.id)
          }
          
          console.log(`\n🎉 Batch payment successful!`)
          console.log(`   Users processed: ${auths.length}`)
          console.log(`   Amount: ${ethers.formatEther(totalAmount)} BDG`)
          console.log(`   Transaction: ${tx.hash}`)
          
        } catch (error) {
          console.error(`\n❌ Batch payment failed:`, error.message)
          
          if (error.data) {
            console.log(`   Error data: ${error.data}`)
          }
          
          // Common error explanations
          if (error.message.includes('Invalid signature')) {
            console.log('   💡 Possible issues:')
            console.log('   - EIP-712 domain mismatch')
            console.log('   - Wrong chain ID in signatures')
            console.log('   - Contract address mismatch')
          }
        }
      } else {
        console.log('\n⏳ No users ready for payment at this time')
      }
    }

  } catch (error) {
    console.error('\n❌ Contract interaction failed:', error.message)
    
    if (error.code === 'CALL_EXCEPTION') {
      console.log('\n💡 Possible issues:')
      console.log('- Contract not deployed at specified address')
      console.log('- Wrong network/RPC URL')
      console.log('- Contract ABI mismatch')
    }
  }
}

// Run test
testWithContract()
  .then(() => console.log('\n✅ Test complete'))
  .catch(err => {
    console.error('\n💥 Test failed:', err)
    process.exit(1)
  })