'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { BrowserProvider, JsonRpcSigner } from 'ethers'
import { ensureAllowance } from '../lib/allowance'

interface Tier {
  id: number
  name: string
  monthlyFee: number
  payoutAmount: number
  description: string
}

interface WalletData {
  user: User
  address: string
  provider: BrowserProvider
  signer: JsonRpcSigner
  chainId: bigint
}

interface TierSelectionProps {
  walletData: WalletData | null
  onComplete?: () => void  // Add callback
}

const TIERS: Tier[] = [
  { id: 1, name: 'Basic', monthlyFee: 50, payoutAmount: 800, description: 'Basic coverage' },
  { id: 2, name: 'Standard', monthlyFee: 100, payoutAmount: 1600, description: 'Enhanced coverage' },
  { id: 3, name: 'Premium', monthlyFee: 150, payoutAmount: 2400, description: 'Full coverage' }
]

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS as string
const REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '0')
const REQUIRED_RPC_URL = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL as string

function toHexChainId(chainId: number) {
  return '0x' + chainId.toString(16)
}

export default function TierSelection({ walletData, onComplete }: TierSelectionProps) {
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function signAuthorization(tier: Tier) {
    if (!walletData || !walletData.user) {
      alert('Please sign in and connect your wallet first')
      return
    }

    setIsLoading(true)
    try {
      const { signer, address } = walletData
      let currentSigner = signer

      // Ensure wallet is on required chain; attempt switch if not
      const provider = signer.provider
      const network = await provider?.getNetwork()
      if (!CONTRACT_ADDRESS) throw new Error('Missing NEXT_PUBLIC_CONTRACT_ADDRESS')
      if (!REQUIRED_CHAIN_ID) throw new Error('Missing NEXT_PUBLIC_CHAIN_ID')
      if ((network?.chainId as bigint | undefined) !== BigInt(REQUIRED_CHAIN_ID)) {
        try {
          await (provider as any).send('wallet_switchEthereumChain', [{ chainId: toHexChainId(REQUIRED_CHAIN_ID) }])
        } catch (err: any) {
          // If chain not added, try to add it (requires RPC URL)
          if (err?.code === 4902 && REQUIRED_RPC_URL) {
            await (provider as any).send('wallet_addEthereumChain', [{
              chainId: toHexChainId(REQUIRED_CHAIN_ID),
              chainName: 'BlockDAG',
              rpcUrls: [REQUIRED_RPC_URL],
              nativeCurrency: { name: 'BDG', symbol: 'BDG', decimals: 18 },
            }])
          } else {
            throw new Error(`Please switch your wallet to chain ${REQUIRED_CHAIN_ID}`)
          }
        }
      }
      // Reacquire provider/signer after a network change to avoid ethers "network changed" error
      const finalProvider = new ethers.BrowserProvider((window as any).ethereum)
      const finalNet = await finalProvider.getNetwork()
      currentSigner = await finalProvider.getSigner()

      // Get auth token to authenticate API calls
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      console.log('🔄 Starting tier registration for:', tier.name)

      // Get user's current nonce from backend
      const nonceResponse = await fetch('/api/user-nonce', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      const { nonce } = await nonceResponse.json()
      console.log('📝 Got nonce:', nonce)

      // EIP-712 typed data
      // Resolve token decimals to scale human fee correctly
      const token = new ethers.Contract(TOKEN_ADDRESS, ['function decimals() view returns (uint8)'], signer)
      const decimalsEnv = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS
      const decimals: number = decimalsEnv ? Number(decimalsEnv) : await token.decimals()

      // UX: Ensure allowance first (one-click approve if needed)
      const approval = await ensureAllowance({ monthlyFee: tier.monthlyFee, ownerAddress: address })
      if (approval?.txHash) {
        console.log('✅ Approval tx:', approval.txHash)
      }

      const domain = {
        name: "MicroInsurancect Tier",
        version: "1",
        chainId: Number(finalNet?.chainId ?? REQUIRED_CHAIN_ID),
        verifyingContract: CONTRACT_ADDRESS
      }

      const types = {
        PremiumAuthorization: [
          { name: "user", type: "address" },
          { name: "tier", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "period", type: "uint256" },
          { name: "validUntil", type: "uint256" },
          { name: "nonce", type: "uint256" }
        ]
      }

      const value = {
        user: address,
        tier: tier.id,
        amount: ethers.parseUnits(tier.monthlyFee.toString(), decimals),
        period: 30 * 24 * 60 * 60, // 30 days in seconds
        validUntil: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year from now
        nonce: nonce
      }

      console.log('📋 Signing typed data:', { domain, types, value })

      const signature = await currentSigner.signTypedData(domain, types, value)
      console.log('✍️ Signature created:', signature.slice(0, 20) + '...')
      
      // Send to backend with auth token
      const response = await fetch('/api/register-tier', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          walletAddress: address,
          typedData: { domain, types, value },
          signature,
          tier: tier.id,
          monthlyFee: tier.monthlyFee,
          payoutAmount: tier.payoutAmount
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Registration successful:', result)
        alert(`Successfully registered for ${tier.name} tier!`)
        setSelectedTier(tier)
        
        // Call completion callback
        onComplete?.()
      } else {
        const error = await response.text()
        throw new Error(error)
      }

    } catch (error: any) {
      console.error('❌ Signing failed:', error)
      alert('Failed to register: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Select Insurance Tier</h2>
      
      {selectedTier ? (
        <div className="text-green-600 bg-green-50 p-4 rounded">
          <p className="font-bold">✅ Registered for {selectedTier.name} tier</p>
          <p>Monthly fee: {selectedTier.monthlyFee} BDG</p>
          <p>Payout amount: {selectedTier.payoutAmount} Rands</p>
          <p className="text-sm text-green-700 mt-2">
            Signature has been stored in the database
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <div key={tier.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-lg">{tier.name}</h3>
              <p className="text-gray-600 mb-2">{tier.description}</p>
              <p className="mb-2">
                <span className="font-semibold">{tier.monthlyFee} BDG</span> per month
              </p>
              <p className="mb-4 text-sm text-gray-500">
                Payout: {tier.payoutAmount} Rands over 4 months
              </p>
              <button
                onClick={() => signAuthorization(tier)}
                disabled={isLoading || !walletData || !walletData.user}
                className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Signing...' : 'Select This Tier'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}