import { ethers } from 'ethers'

const REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '0')
const RPC_URL = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_URL as string | undefined
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS as string

const ERC20_ABI = [
	'function allowance(address owner, address spender) view returns (uint256)',
	'function approve(address spender, uint256 amount) returns (bool)',
	'function decimals() view returns (uint8)',
]

const toHex = (n: number) => '0x' + n.toString(16)

export async function ensureAllowance({ monthlyFee, ownerAddress, infinite = false }: { monthlyFee: number; ownerAddress: string; infinite?: boolean }) {
	if (!window.ethereum) throw new Error('Wallet not found')

	const provider = new ethers.BrowserProvider(window.ethereum)
	let net = await provider.getNetwork()
	if (REQUIRED_CHAIN_ID && net.chainId !== BigInt(REQUIRED_CHAIN_ID)) {
		try {
			await provider.send('wallet_switchEthereumChain', [{ chainId: toHex(REQUIRED_CHAIN_ID) }])
		} catch (e: any) {
			if (e?.code === 4902 && RPC_URL) {
				await provider.send('wallet_addEthereumChain', [{
					chainId: toHex(REQUIRED_CHAIN_ID),
					chainName: 'BlockDAG',
					rpcUrls: [RPC_URL],
					nativeCurrency: { name: 'BDG', symbol: 'BDG', decimals: 18 },
				}])
			} else {
				throw e
			}
		}
		net = await provider.getNetwork()
	}

	const signer = await provider.getSigner()
	const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer)
	const decOverride = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS
	const decimals: number = decOverride ? Number(decOverride) : await token.decimals()
	const required = infinite ? ethers.MaxUint256 : ethers.parseUnits(monthlyFee.toString(), decimals)

	const allowance: bigint = await token.allowance(ownerAddress, CONTRACT_ADDRESS)
	if (allowance >= required && !infinite) return { approved: true, txHash: null }

	const tx = await token.approve(CONTRACT_ADDRESS, required)
	const receipt = await tx.wait()
	return { approved: true, txHash: receipt?.hash ?? null }
}


