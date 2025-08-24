'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { supabase, testConnectionWithAuth } from '../../lib/supabase'

const tiers = [
  { id: 1, name: 'Basic', monthlyFee: 0.05, payoutAmount: 800 },
  { id: 2, name: 'Standard', monthlyFee: 0.1, payoutAmount: 1600 },
  { id: 3, name: 'Premium', monthlyFee: 0.15, payoutAmount: 2400 }
]

export default function OnboardingPage() {
  // State management
  const [user, setUser] = useState<any>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dbStatus, setDbStatus] = useState<'loading' | 'success' | 'error'>('loading')

  // Test database on load
  useEffect(() => {
    async function testDB() {
      const connected = await testConnectionWithAuth()
      setDbStatus(connected ? 'success' : 'error')
    }
    testDB()
    
    // Check for existing auth
    checkUser()
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
    })
    
    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        // Check for existing wallet
        const { data } = await supabase
          .from('users')
          .select('wallet_address, tier')
          .eq('auth_user_id', user.id)
          .single()
        
        if (data?.wallet_address) {
          setWalletAddress(data.wallet_address)
        }
        if (data?.tier) {
          const tierData = tiers.find(t => t.id === data.tier)
          if (tierData) {
            setSelectedTier(tierData)
          }
        }
      }
    } catch (error) {
      console.log('No authenticated user')
    }
  }

  // Step 1: Sign in with email
  async function signInWithEmail() {
    const email = prompt('Enter your email:')
    if (!email) return

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) throw error
      alert('Check your email for the login link!')
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2: Connect wallet
  async function connectWallet() {
    if (!user) {
      alert('Please sign in first')
      return
    }

    if (!(window as any).ethereum) {
      alert('Please install MetaMask')
      return
    }

    setIsLoading(true)
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      // Store in database
      const { error } = await supabase
        .from('users')
        .upsert({
          auth_user_id: user.id,
          wallet_address: address.toLowerCase()
        }, {
          onConflict: 'auth_user_id'
        })

      if (error) throw error
      
      setWalletAddress(address)
      console.log('✅ Wallet connected:', address)
      
    } catch (error: any) {
      alert('Wallet connection failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: Select tier and sign
  async function selectTier(tier: any) {
    if (!user || !walletAddress) {
      alert('Please complete previous steps first')
      return
    }

    setIsLoading(true)
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner()
      const network = await provider.getNetwork()

      // Get current nonce
      const { data: { session } } = await supabase.auth.getSession()
      const nonceResponse = await fetch('/api/user-nonce', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      const { nonce } = await nonceResponse.json()

      // Create EIP-712 signature
      const domain = {
        name: "MicroInsurance",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x1234567890123456789012345678901234567890'
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
        user: walletAddress,
        tier: tier.id,
        amount: ethers.parseUnits(tier.monthlyFee.toString(), 18).toString(),
        period: 30 * 24 * 60 * 60,
        validUntil: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
        nonce: nonce
      }

      const signature = await signer.signTypedData(domain, types, value)
      
      // Store in database
      const response = await fetch('/api/register-tier', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          walletAddress,
          typedData: { domain, types, value },
          signature,
          tier: tier.id,
          monthlyFee: tier.monthlyFee,
          payoutAmount: tier.payoutAmount
        })
      })

      if (response.ok) {
        setSelectedTier(tier)
        alert(`✅ Successfully registered for ${tier.name} tier!`)
      } else {
        throw new Error('Registration failed')
      }

    } catch (error: any) {
      alert('Tier selection failed: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }



  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center">Insurance Onboarding</h1>
      
      {/* Database Status */}
      <div className="mb-6 text-center">
        {dbStatus === 'loading' && <p>🔄 Testing database...</p>}
        {dbStatus === 'success' && <p className="text-green-600">✅ Database connected</p>}
        {dbStatus === 'error' && <p className="text-red-600">❌ Database connection failed</p>}
      </div>

      {/* Step 1: Sign In */}
      {!user ? (
        <div className="mb-8 p-6 border rounded-lg">
          <h2 className="text-xl font-bold mb-4">Step 1: Sign In</h2>
          <button 
            onClick={signInWithEmail}
            disabled={isLoading}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Sign In with Email'}
          </button>
        </div>
      ) : (
        <div className="mb-8 p-6 border rounded-lg bg-green-50">
          <h2 className="text-xl font-bold mb-4 text-green-800">✅ Step 1: Signed In</h2>
          <p className="text-green-700">Signed in as: {user.email}</p>
        </div>
      )}

      {/* Step 2: Connect Wallet */}
      {user && (
        <div className="mb-8 p-6 border rounded-lg">
          <h2 className="text-xl font-bold mb-4">Step 2: Connect Wallet</h2>
          {!walletAddress ? (
            <button 
              onClick={connectWallet}
              disabled={isLoading}
              className="bg-orange-500 text-white px-6 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {isLoading ? 'Connecting...' : 'Connect MetaMask'}
            </button>
          ) : (
            <p className="text-green-600">✅ Wallet: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</p>
          )}
        </div>
      )}

      {/* Step 3: Select Tier */}
      {user && walletAddress && (
        <div className="mb-8 p-6 border rounded-lg">
          <h2 className="text-xl font-bold mb-4">Step 3: Select Insurance Tier</h2>
          {selectedTier ? (
            <div className="text-green-600 bg-green-50 p-4 rounded">
              <p className="font-bold">✅ Currently registered for {selectedTier.name} tier</p>
              <p>Monthly fee: {selectedTier.monthlyFee} BDG</p>
              <p>Payout amount: {selectedTier.payoutAmount} Rands</p>
              <button
                onClick={() => setSelectedTier(null)}
                className="mt-3 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                Change Tier
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <div key={tier.id} className="border rounded-lg p-4">
                  <h3 className="font-bold text-lg">{tier.name}</h3>
                  <p className="mb-2">{tier.monthlyFee} BDG per month</p>
                  <p className="mb-4 text-sm text-gray-500">Payout: {tier.payoutAmount} Rands</p>
                  <button
                    onClick={() => selectTier(tier)}
                    disabled={isLoading}
                    className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
                  >
                    {isLoading ? 'Signing...' : 'Select This Tier'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-100 rounded text-sm">
          <h3 className="font-bold mb-2">Debug Info:</h3>
          <p>User: {user?.email || 'Not signed in'}</p>
          <p>Wallet: {walletAddress || 'Not connected'}</p>
          <p>Tier: {selectedTier?.name || 'Not selected'}</p>
          <p>Contract: {process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || 'Not set'}</p>
        </div>
      )}
    </div>
  )
}