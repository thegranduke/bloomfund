'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { BrowserProvider, JsonRpcSigner } from 'ethers'

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
  currentTier?: { id: number } | null  // Current tier from database
  onComplete?: () => void  // Add callback
}

const TIERS: Tier[] = [
  { id: 1, name: 'Basic', monthlyFee: 0.05, payoutAmount: 800, description: 'Basic coverage' },
  { id: 2, name: 'Standard', monthlyFee: 0.1, payoutAmount: 1600, description: 'Enhanced coverage' },
  { id: 3, name: 'Premium', monthlyFee: 0.15, payoutAmount: 2400, description: 'Full coverage' }
]

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x...'

export default function TierSelection({ walletData, currentTier, onComplete }: TierSelectionProps) {
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Set selected tier from database on component mount or when currentTier changes
  useEffect(() => {
    if (currentTier?.id) {
      const tier = TIERS.find(t => t.id === currentTier.id)
      if (tier) {
        setSelectedTier(tier)
      }
    }
  }, [currentTier])

  async function signAuthorization(tier: Tier) {
    if (!walletData || !walletData.user) {
      alert('Please sign in and connect your wallet first')
      return
    }

    setIsLoading(true)
    try {
      const { signer, chainId, address, user } = walletData

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
      const domain = {
        name: "MicroInsurancect Tier",
        version: "1",
        chainId: Number(chainId),
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
        amount: ethers.parseUnits(tier.monthlyFee.toString(), 18),
        period: 30 * 24 * 60 * 60, // 30 days in seconds
        validUntil: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year from now
        nonce: nonce
      }

      console.log('📋 Signing typed data:', { domain, types, value })

      const signature = await signer.signTypedData(domain, types, value)
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
        <div className="text-green-600 bg-green-50 p-4 rounded mb-4">
          <p className="font-bold">✅ Currently registered for {selectedTier.name} tier</p>
          <p>Monthly fee: {selectedTier.monthlyFee} BDG</p>
          <p>Payout amount: {selectedTier.payoutAmount} Rands</p>
          <p className="text-sm text-green-700 mt-2">
            Signature has been stored in the database
          </p>
          <button
            onClick={() => setSelectedTier(null)}
            className="mt-3 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            Change Tier
          </button>
        </div>
      ) : null}
      
      {!selectedTier && (
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