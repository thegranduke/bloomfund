'use client'

import { useState, useEffect } from 'react'
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers'
import { supabase, getCurrentUser } from '../lib/supabase'
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

  useEffect(() => {
    // Check if user is already authenticated
    checkUser()
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      if (!session?.user) {
        setWalletAddress(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    try {
      const user = await getCurrentUser()
      setUser(user)
      
      // If user is logged in, check if they have a connected wallet
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('wallet_address')
          .eq('auth_user_id', user.id)
          .single()
        
        if (data?.wallet_address) {
          setWalletAddress(data.wallet_address)
        }
      }
    } catch (error) {
      console.log('No authenticated user')
    }
  }

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

  async function connectWallet() {
    if (!user) {
      alert('Please sign in first')
      return
    }

    if (!window.ethereum) {
      alert('Please install MetaMask or another wallet.')
      return
    }

    setIsLoading(true)
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()
      
      // Store wallet address in database linked to authenticated user
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
      onConnect({ 
        user, 
        address, 
        provider, 
        signer, 
        chainId: network.chainId 
      })
      
      console.log('Wallet connected for user:', user.email, 'Address:', address)
    } catch (error: any) {
      console.error('Connection failed:', error)
      alert('Failed to connect wallet: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setWalletAddress(null)
  }

  return (
    <div className="p-6 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Account & Wallet</h2>
      
      {!user ? (
        <div>
          <p className="mb-4 text-gray-600">Sign in to connect your wallet and access insurance</p>
          <button 
            onClick={signInWithEmail}
            disabled={isLoading}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Sign In with Email'}
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-4 p-3 bg-green-50 rounded">
            <p className="text-green-800">✅ Signed in as: {user.email}</p>
            <button 
              onClick={signOut}
              className="text-sm text-green-600 hover:underline"
            >
              Sign out
            </button>
          </div>
          
          {!walletAddress ? (
            <button 
              onClick={connectWallet}
              disabled={isLoading}
              className="bg-orange-500 text-white px-6 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="text-green-600">
              <p>✅ Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}