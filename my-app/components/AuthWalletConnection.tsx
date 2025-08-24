'use client'

import { useState, useEffect } from 'react'
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers'
import { supabase, getCurrentUser } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface WalletData {
  user: User
  address: string
  provider: BrowserProvider
  signer: JsonRpcSigner
  chainId: bigint
}

interface AuthWalletConnectionProps {
  onConnect: (walletData: WalletData) => void
}

export default function AuthWalletConnection({ onConnect }: AuthWalletConnectionProps) {
  const [user, setUser] = useState<User | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkUser()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email)
      setUser(session?.user || null)
      if (!session?.user) {
        setWalletAddress(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check existing wallet when user signs in
  useEffect(() => {
    if (user && !walletAddress) {
      checkExistingWallet()
    }
  }, [user])

  async function checkUser() {
    try {
      const user = await getCurrentUser()
      setUser(user)
    } catch (error) {
      console.log('No authenticated user')
    }
  }

  async function checkExistingWallet() {
    if (!user) return
    
    try {
      const { data } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('auth_user_id', user.id)
        .single()
      
      if (data?.wallet_address) {
        setWalletAddress(data.wallet_address)
        console.log('Found existing wallet:', data.wallet_address)
      }
    } catch (error) {
      console.log('No existing wallet found')
    }
  }

  async function signInWithEmail() {
    const email = prompt('Enter your email for magic link authentication:')
    if (!email) return

    setIsLoading(true)
    setError(null)
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) throw error
      alert('✅ Check your email for the login link!')
    } catch (error: any) {
      setError('Authentication failed: ' + error.message)
      console.error('Auth error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function connectWallet() {
    if (!user) {
      setError('Please sign in first')
      return
    }

    if (!(window as any).ethereum) {
      setError('Please install MetaMask or another Web3 wallet')
      return
    }

    setIsLoading(true)
    setError(null)
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()
      
      console.log('Wallet connected:', address, 'Chain:', network.chainId)
      
      // Store wallet in database
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
      
      // Call parent callback with complete wallet data
      onConnect({ 
        user, 
        address, 
        provider, 
        signer, 
        chainId: network.chainId 
      })
      
    } catch (error: any) {
      setError('Wallet connection failed: ' + error.message)
      console.error('Wallet error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setError('Sign out failed: ' + error.message)
    } else {
      setUser(null)
      setWalletAddress(null)
      setError(null)
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Step 1 & 2: Authentication & Wallet</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}
      
      {!user ? (
        <div className="text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">📧</div>
            <h3 className="text-xl font-semibold mb-2">Sign In Required</h3>
            <p className="text-gray-600 mb-4">
              Enter your email to receive a secure magic link for authentication
            </p>
          </div>
          <button 
            onClick={signInWithEmail}
            disabled={isLoading}
            className="bg-blue-500 text-white px-8 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold"
          >
            {isLoading ? 'Sending Magic Link...' : 'Sign In with Email'}
          </button>
        </div>
      ) : (
        <div>
          {/* User Authenticated */}
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-800 font-semibold">✅ Authenticated</p>
                <p className="text-green-600 text-sm">{user.email}</p>
              </div>
              <button 
                onClick={signOut}
                className="text-green-600 hover:text-green-800 text-sm underline"
              >
                Sign out
              </button>
            </div>
          </div>
          
          {/* Wallet Connection */}
          {!walletAddress ? (
            <div className="text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">🔗</div>
                <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
                <p className="text-gray-600 mb-4">
                  Link your MetaMask wallet to access blockchain features
                </p>
              </div>
              <button 
                onClick={connectWallet}
                disabled={isLoading}
                className="bg-orange-500 text-white px-8 py-3 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-semibold"
              >
                {isLoading ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold">✅ Wallet Connected</p>
              <p className="text-green-600 text-sm font-mono">
                {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}