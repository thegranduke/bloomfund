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

  // Read helpers
  const readMicro = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    [
      'function owner() view returns (address)',
      'function nonces(address) view returns (uint256)',
      'function lastPaidAt(address) view returns (uint256)',
      'function paymentToken() view returns (address)'
    ],
    provider
  )

  // Optional: authorization preflight for common patterns
  try {
    const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!
    const relayerAddr = await relayerWallet.getAddress()
    // AccessControl-like
    try {
      const access = new ethers.Contract(addr, ['function hasRole(bytes32,address) view returns (bool)'], provider)
      const role = ethers.keccak256(ethers.toUtf8Bytes('RELAYER_ROLE'))
      const has = await access.hasRole(role, relayerAddr)
      console.log('has RELAYER_ROLE:', has)
    } catch {}
    // Simple isRelayer(address) pattern
    try {
      const mod = new ethers.Contract(addr, ['function isRelayer(address) view returns (bool)'], provider)
      const isRel = await mod.isRelayer(relayerAddr)
      console.log('isRelayer:', isRel)
    } catch {}
  } catch {}

  // Get pending users with latest active authorization (signature + typed data)
  const { data: users, error } = await supabase
    .from('users')
    .select(`
      id,
      wallet_address,
      is_active,
      authorizations:authorizations!inner(
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
    console.error('Database error:', error)
    return
  }

  console.log(`Found ${users.length} users to process`)

  // Process each user
  for (const user of users) {
    const auth = user.authorizations[0] // Get latest authorization
    
    try {
      console.log(`Processing payment for ${user.wallet_address}...`)
      // --- Preflight checks to avoid opaque reverts ---
      const domain = auth.typed_data_json?.domain
      const types = auth.typed_data_json?.types
      const value = auth.typed_data_json?.value
      const sig: string = auth.signature

      // 1) ChainId and contract address must match typed data
      const net = await provider.getNetwork()
      if (!domain) throw new Error('Missing typed data domain')
      if (BigInt(domain.chainId) !== net.chainId) {
        throw new Error(`chainId mismatch: domain=${domain.chainId} runtime=${net.chainId}`)
      }
      if (!domain.verifyingContract || !process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
        throw new Error('Missing verifyingContract or env NEXT_PUBLIC_CONTRACT_ADDRESS')
      }
      if (String(domain.verifyingContract).toLowerCase() !== String(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS).toLowerCase()) {
        throw new Error(`verifyingContract mismatch: domain=${domain.verifyingContract} env=${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`)
      }
      if (await provider.getCode(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!) === '0x') {
        throw new Error('No code at NEXT_PUBLIC_CONTRACT_ADDRESS')
      }

      // 2) Signature sanity + recovery must equal user wallet
      if (!ethers.isHexString(sig, 65)) throw new Error('Signature must be 65 bytes (0x + 130 hex)')
      const recovered = ethers.verifyTypedData(domain, types, value, sig)
      if (recovered.toLowerCase() !== String(user.wallet_address).toLowerCase()) {
        throw new Error(`Recovered ${recovered} != expected ${user.wallet_address}`)
      }

      // 3) Expiry check
      const now = Math.floor(Date.now() / 1000)
      if (Number(value?.validUntil ?? 0) <= now) throw new Error('Authorization expired')

      // 4) Optional shape check for user field in value
      if (value?.user && String(value.user).toLowerCase() !== String(user.wallet_address).toLowerCase()) {
        throw new Error(`Typed data user ${value.user} != expected ${user.wallet_address}`)
      }

      // 5) Dry-run to surface custom errors early (ethers v6 staticCall API)
      await (insuranceContract as any).payBatch.staticCall([value], [sig])

      // Additional guards matching MicroInsurance.sol
      const expectedNonce = await readMicro.nonces(user.wallet_address)
      if (BigInt(value.nonce) !== expectedNonce) {
        throw new Error(`Nonce mismatch: value=${value.nonce} expected=${expectedNonce}`)
      }
      const last = await readMicro.lastPaidAt(user.wallet_address)
      const nowTs = Math.floor(Date.now()/1000)
      if (nowTs < Number(last) + Number(value.period)) {
        throw new Error(`PaymentTooEarly: lastPaidAt=${last} period=${value.period}`)
      }

      // Call smart contract (real tx)
      const tx = await insuranceContract.payBatch(
        [value],
        [sig]
      )
      
      console.log(`✅ Payment processed: ${tx.hash}`)
      await tx.wait()
      
      // Update database
      await supabase
        .from('users')
        .update({ last_paid_at: new Date().toISOString() })
        .eq('id', user.id)
        
    } catch (error: any) {
      // Enhanced diagnostics for ethers v6
      const code = error?.code
      const shortMessage = error?.shortMessage || error?.reason
      const message = error?.message
      const tx = error?.transaction || error?.info?.transaction
      const data: string | undefined = error?.data?.data || error?.data || error?.error?.data || error?.info?.error?.data

      console.error(`❌ Payment failed for ${user.wallet_address}`)
      console.error('meta:', { code, shortMessage, message })
      if (tx) console.error('tx:', { to: tx.to, from: tx.from })

      if (typeof data === 'string' && data.startsWith('0x')) {
        const selector = data.length >= 10 ? data.slice(0, 10) : data
        console.error('revert data selector:', selector)
        try {
          const iface = new ethers.Interface([
            // Include your contract's custom errors for readable decoding:
            "error InvalidSignature()",
            "error AuthorizationExpired(uint256)",
            "error NonceAlreadyUsed(address,uint256)",
            "error NotRelayer(address)",
            "error InvalidTier(uint256)"
          ])
          const parsed = iface.parseError(data)
          console.error('decoded:', parsed?.name, parsed?.args)
        } catch (parseErr) {
          console.error('raw revert data:', data)
        }
      }
    }
  }
}

// Run the test
testRelayerPayment()
  .then(() => console.log('Relayer test complete'))
  .catch(error => console.error('Script failed:', error))