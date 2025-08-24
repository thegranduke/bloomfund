# BloomFund - Decentralized Micro-Insurance Platform

BloomFund is a decentralized micro-insurance platform built on BlockDAG blockchain that provides affordable insurance coverage for users. The platform combines blockchain technology with traditional insurance principles to create a transparent, efficient, and accessible insurance system.

## 🚀 Features

- **Decentralized Insurance**: Smart contract-based insurance policies on BlockDAG blockchain
- **Multi-Tier Coverage**: Three insurance tiers (Basic, Standard, Premium) with different coverage amounts
- **Automated Premium Collection**: Monthly premium payments handled through smart contracts
- **Claim Management**: Digital claim submission and approval system
- **Admin Dashboard**: Comprehensive admin interface for policy and claim management
- **User Authentication**: Secure authentication with Supabase
- **Wallet Integration**: MetaMask and other Web3 wallet support
- **Real-time Eligibility**: Smart contract-based eligibility checking

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 15 with App Router, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL database, authentication, real-time subscriptions)
- **Blockchain**: BlockDAG network with Solidity smart contracts
- **UI Components**: shadcn/ui component library
- **Smart Contract Deployment**: BlockDAG IDE
- **Testing**: TypeScript scripts with tsx for functionality testing

### Smart Contract
- **MicroInsurance.sol**: Main insurance contract handling policies, premiums, and claims
- **EIP-712 Signatures**: Secure authorization for premium payments
- **Multi-tier System**: Configurable insurance tiers with different coverage levels

## 📋 Prerequisites

Before setting up the project locally, ensure you have:

- **Node.js** (v18 or higher)
- **npm** or **yarn** package manager
- **MetaMask** or another Web3 wallet
- **BlockDAG tokens** for testing
- **Supabase account** for database and authentication
- **BlockDAG IDE access** for smart contract deployment (if needed)

## 🛠️ Local Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bloomfund
cd my-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env.local` file in the `my-app` directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# BlockDAG Network Configuration
NEXT_PUBLIC_CONTRACT_ADDRESS=your_deployed_contract_address
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=your_payment_token_contract_address
NEXT_PUBLIC_TREASURY_ADDRESS=your_treasury_wallet_address
BLOCKDAG_RPC_URL=https://rpc.primordial.bdagscan.com/
NEXT_PUBLIC_CHAIN_ID=1043

# Deployment Configuration
PRIVATE_KEY=your_deployment_private_key

# Optional: For local development
NEXT_PUBLIC_LOCAL_RPC_URL=http://localhost:8545
```

### 4. Database Setup

1. **Create Supabase Project**:
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Create a new project
   - Copy the project URL and anon key to your `.env.local`

2. **Database Schema**:
   The application uses the following main tables:
   - `users`: User profiles and policy information
   - `authorizations`: EIP-712 signature authorizations
   - `claims`: Insurance claims and their status

3. **Environment Variables Explained**:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_*_KEY`: Supabase authentication keys (multiple variants for compatibility)
   - `NEXT_PUBLIC_CONTRACT_ADDRESS`: Deployed MicroInsurance smart contract address
   - `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS`: BlockDAG token contract address for payments
   - `NEXT_PUBLIC_TREASURY_ADDRESS`: Treasury wallet address for collecting premiums
   - `BLOCKDAG_RPC_URL`: BlockDAG network RPC endpoint
   - `NEXT_PUBLIC_CHAIN_ID`: BlockDAG network chain ID (1043)
   - `PRIVATE_KEY`: Private key for contract deployment and admin operations

### 5. Smart Contract Deployment

**Smart contracts are deployed using the BlockDAG IDE:**

1. **Access BlockDAG IDE**: Go to the BlockDAG IDE at [ide.blockdag.network](https://ide.blockdag.network)
2. **Deploy Contract**: Upload and deploy the `MicroInsurance.sol` contract
3. **Get Contract Address**: Copy the deployed contract address to your `.env.local`
4. **Verify Deployment**: Ensure the contract is properly deployed and verified

**Note**: The smart contracts are already deployed on BlockDAG testnet. You only need to run the frontend locally.

### 6. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📱 Application Pages & Features

### 🏠 Home Page (`/`)
- **Purpose**: Landing page and authentication gateway
- **Features**:
  - User authentication status display
  - Navigation to onboarding process
  - Environment variable validation
  - Theme switching (light/dark mode)

### 🔐 Authentication Pages (`/auth/*`)
- **Login** (`/auth/login`): Email-based authentication with magic links
- **Sign Up** (`/auth/sign-up`): New user registration
- **Password Reset** (`/auth/forgot-password`): Password recovery
- **Callback** (`/auth/callback`): Handles authentication redirects

### 👤 User Onboarding (`/onboarding`)
- **Purpose**: Complete user setup and policy selection
- **Process**:
  1. **Email Authentication**: Sign in with email (magic link)
  2. **Wallet Connection**: Connect Web3 wallet (MetaMask)
  3. **Tier Selection**: Choose insurance tier (Basic/Standard/Premium)
  4. **Authorization**: Sign EIP-712 authorization for premium payments
  5. **Policy Activation**: Complete setup and activate insurance policy

**Insurance Tiers**:
- **Basic**: 0.05 BDG/month, 800 Rands coverage
- **Standard**: 0.1 BDG/month, 1600 Rands coverage  
- **Premium**: 0.15 BDG/month, 2400 Rands coverage

### 📋 Claims Management (`/claims`)
- **Purpose**: Submit and track insurance claims
- **Features**:
  - **Eligibility Check**: Real-time verification of claim eligibility
  - **Claim Submission**: Upload documents and submit claims
  - **Claim History**: View all submitted claims and their status
  - **Payment Tracking**: Monitor installment payments for approved claims

**Claim Process**:
1. Verify eligibility (active policy, sufficient payments)
2. Submit claim with document hash
3. Admin review and approval
4. Installment-based payout system

### 🔧 Admin Dashboard (`/admin`)
- **Purpose**: Comprehensive administration interface
- **Features**:

#### Overview Tab
- Contract statistics (balance, total premiums, tier information)
- System health monitoring
- Quick actions and status indicators

#### Users Management
- View all registered users and their policies
- Manual tier updates
- Payment verification and management
- User status monitoring

#### Claims Management
- Review pending claims
- Approve/reject claims with comments
- Set payout amounts and installment schedules
- Track claim status and payment progress

#### System Configuration
- Contract interaction testing
- Database health checks
- Environment variable validation
- System diagnostics

## 🔧 Smart Contract Details

### MicroInsurance Contract
The main smart contract (`contracts/MicroInsurance.sol`) provides:

**Core Functions**:
- `createTier()`: Define insurance tiers with fees and coverage
- `payPremium()`: Process monthly premium payments
- `submitClaim()`: Submit new insurance claims
- `approveClaim()`: Approve claims and set payout schedule
- `payInstallment()`: Process claim installment payments

**Key Features**:
- EIP-712 signature verification for secure authorizations
- Multi-tier insurance system
- Automated premium collection
- Installment-based claim payouts
- Role-based access control (owner, relayers)

## 🧪 Testing & Development

### Available Scripts
```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Testing Scripts (using tsx)
npx tsx scripts/comprehensive-insurance-test.js    # Full system testing
npx tsx scripts/test-with-contract.js              # Contract interaction testing
npx tsx scripts/test-relayer.ts                    # Relayer functionality testing
npx tsx scripts/setup-user-tokens.ts               # User token setup for testing
```

### Test Scripts
The `scripts/` directory contains various testing utilities that can be run with `npx tsx`:
- `comprehensive-insurance-test.js`: Full system testing
- `test-with-contract.js`: Contract interaction testing
- `test-relayer.ts`: Relayer functionality testing
- `setup-user-tokens.ts`: User token setup for testing

**Note**: These scripts are used to test the functionality of your deployed smart contracts and application features.

## 🔒 Security Features

- **EIP-712 Signatures**: Secure authorization for premium payments
- **Role-based Access**: Owner and relayer permissions
- **Input Validation**: Comprehensive parameter validation
- **Reentrancy Protection**: Secure contract interactions
- **Authentication**: Supabase-based user authentication

## 🌐 Deployment

### Production Deployment
1. Set up production environment variables
2. Deploy smart contract to mainnet
3. Configure Supabase production project
4. Deploy Next.js application to Vercel/Netlify

### Environment Variables for Production
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_production_key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE=your_production_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_key

# BlockDAG Network Configuration
NEXT_PUBLIC_CONTRACT_ADDRESS=your_mainnet_contract_address
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=your_mainnet_payment_token_address
NEXT_PUBLIC_TREASURY_ADDRESS=your_mainnet_treasury_address
BLOCKDAG_RPC_URL=https://rpc.primordial.bdagscan.com/
NEXT_PUBLIC_CHAIN_ID=1043

# Deployment Configuration
PRIVATE_KEY=your_production_deployment_key
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Check the documentation
- Review existing issues
- Create a new issue with detailed information

## 🔄 Version History

- **v1.0.0**: Initial release with core insurance functionality
- Multi-tier insurance system
- Smart contract-based premium collection
- Claim management system
- Admin dashboard
- User authentication and onboarding
