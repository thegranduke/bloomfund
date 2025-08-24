// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MicroInsurance 
 * @dev Decentralized micro-insurance system for BlockDAG
 * Simplified version for BlockDAG IDE deployment
 */
contract MicroInsurance {
    
    // Owner and roles
    address public owner;
    mapping(address => bool) public relayers;
    
    // EIP-712 Domain separator  
    bytes32 public DOMAIN_SEPARATOR;
    string private constant EIP712_DOMAIN = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
    string private constant PREMIUM_AUTHORIZATION_TYPE = "PremiumAuthorization(address user,uint256 tier,uint256 amount,uint256 period,uint256 validUntil,uint256 nonce)";
    
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(abi.encodePacked(EIP712_DOMAIN));
    bytes32 private constant PREMIUM_AUTHORIZATION_TYPEHASH = keccak256(abi.encodePacked(PREMIUM_AUTHORIZATION_TYPE));

    // Structs
    struct PremiumAuthorization {
        address user;
        uint256 tier;
        uint256 amount;
        uint256 period;
        uint256 validUntil;
        uint256 nonce;
    }

    struct InsuranceTier {
        uint256 monthlyFee;    // Monthly premium in wei
        uint256 payoutAmount;  // Payout amount in Rands
        bool active;
    }

    struct UserPolicy {
        uint256 tier;
        uint256 lastPaidAt;
        uint256 totalPaid;
        bool active;
    }

    struct Claim {
        address user;
        uint256 policyTier;
        uint256 payoutAmount;
        uint256 installmentsPaid;
        uint256 totalInstallments;
        uint256 approvedAt;
        bool active;
    }

    // State variables
    mapping(uint256 => InsuranceTier) public tiers;
    mapping(address => UserPolicy) public policies;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public lastPaidAt;
    mapping(uint256 => Claim) public claims;
    
    uint256 public nextClaimId = 1;
    uint256 public totalPremiumsCollected;

    // Events
    event TierCreated(uint256 indexed tierId, uint256 monthlyFee, uint256 payoutAmount);
    event PremiumPaid(address indexed user, uint256 tier, uint256 amount, uint256 timestamp);
    event ClaimSubmitted(uint256 indexed claimId, address indexed user, uint256 tier);
    event ClaimApproved(uint256 indexed claimId, uint256 payoutAmount);
    event InstallmentPaid(uint256 indexed claimId, address indexed user, uint256 amount);
    event RelayerAdded(address relayer);
    event RelayerRemoved(address relayer);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyRelayer() {
        require(relayers[msg.sender] || msg.sender == owner, "Not relayer");
        _;
    }

    constructor() {
        owner = msg.sender;
        relayers[msg.sender] = true;
        
        // Set up EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("MicroInsurance"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
        
        // Initialize default tiers (using parseEther equivalent)
        _createTier(1, 50000000000000000, 800);   // 0.05 BDG = 50000000000000000 wei, 800 Rands
        _createTier(2, 100000000000000000, 1600); // 0.1 BDG = 100000000000000000 wei, 1600 Rands  
        _createTier(3, 150000000000000000, 2400); // 0.15 BDG = 150000000000000000 wei, 2400 Rands
    }

    // Helper function to recreate parseEther functionality
    function parseEther(uint256 etherAmount) pure internal returns (uint256) {
        return etherAmount * 1 ether;
    }

    function _createTier(uint256 tierId, uint256 monthlyFee, uint256 payoutAmount) internal {
        tiers[tierId] = InsuranceTier({
            monthlyFee: monthlyFee,
            payoutAmount: payoutAmount,
            active: true
        });
        emit TierCreated(tierId, monthlyFee, payoutAmount);
    }

    /**
     * @dev Adds a relayer address (Owner only)
     */
    function addRelayer(address relayer) external onlyOwner {
        relayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /**
     * @dev Removes a relayer address (Owner only)
     */
    function removeRelayer(address relayer) external onlyOwner {
        relayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /**
     * @dev Updates tier information (Owner only)
     */
    function updateTier(uint256 tierId, uint256 monthlyFee, uint256 payoutAmount, bool active) 
        external 
        onlyOwner 
    {
        require(tiers[tierId].monthlyFee > 0, "Tier does not exist");
        
        tiers[tierId].monthlyFee = monthlyFee;
        tiers[tierId].payoutAmount = payoutAmount;
        tiers[tierId].active = active;
    }

    /**
     * @dev Verifies EIP-712 signature
     */
    function verifySignature(
        PremiumAuthorization memory auth,
        bytes memory signature
    ) internal view returns (address) {
        bytes32 structHash = keccak256(abi.encode(
            PREMIUM_AUTHORIZATION_TYPEHASH,
            auth.user,
            auth.tier,
            auth.amount,
            auth.period,
            auth.validUntil,
            auth.nonce
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            structHash
        ));
        
        return recoverSigner(digest, signature);
    }

    /**
     * @dev Recovers signer from signature
     */
    function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        if (v < 27) {
            v += 27;
        }
        
        require(v == 27 || v == 28, "Invalid signature v");
        
        return ecrecover(hash, v, r, s);
    }

    /**
     * @dev Processes batch premium payments (Relayer only)
     */
    function payBatch(
        PremiumAuthorization[] calldata auths,
        bytes[] calldata signatures
    ) external payable onlyRelayer {
        require(auths.length == signatures.length, "Array length mismatch");
        require(auths.length > 0, "Empty batch");

        uint256 totalRequired = 0;
        
        // First pass: validate all authorizations
        for (uint256 i = 0; i < auths.length; i++) {
            PremiumAuthorization calldata auth = auths[i];
            
            // Validate tier
            require(tiers[auth.tier].active, "Invalid tier");
            require(auth.amount == tiers[auth.tier].monthlyFee, "Invalid amount");
            
            // Validate expiry
            require(block.timestamp <= auth.validUntil, "Authorization expired");
            
            // Validate nonce
            require(nonces[auth.user] == auth.nonce, "Invalid nonce");
            
            // Validate payment timing
            if (lastPaidAt[auth.user] > 0) {
                require(
                    block.timestamp >= lastPaidAt[auth.user] + auth.period,
                    "Payment too early"
                );
            }
            
            // Validate signature
            address recovered = verifySignature(auth, signatures[i]);
            require(recovered == auth.user, "Invalid signature");
            
            totalRequired += auth.amount;
        }
        
        // Validate payment amount
        require(msg.value == totalRequired, "Incorrect payment amount");
        
        // Second pass: process payments
        for (uint256 i = 0; i < auths.length; i++) {
            PremiumAuthorization calldata auth = auths[i];
            
            // Update nonce and payment time
            nonces[auth.user]++;
            lastPaidAt[auth.user] = block.timestamp;
            
            // Update user policy
            UserPolicy storage policy = policies[auth.user];
            if (policy.tier != auth.tier || !policy.active) {
                policy.tier = auth.tier;
                policy.active = true;
            }
            
            policy.lastPaidAt = block.timestamp;
            policy.totalPaid += auth.amount;
            
            totalPremiumsCollected += auth.amount;
            
            emit PremiumPaid(auth.user, auth.tier, auth.amount, block.timestamp);
        }
    }

    /**
     * @dev Submits a claim
     */
    function submitClaim(bytes32 documentHash) external returns (uint256 claimId) {
        UserPolicy storage policy = policies[msg.sender];
        require(policy.active, "No active policy");
        require(policy.totalPaid >= tiers[policy.tier].monthlyFee * 6, "Insufficient premiums");
        
        claimId = nextClaimId++;
        
        claims[claimId] = Claim({
            user: msg.sender,
            policyTier: policy.tier,
            payoutAmount: 0,
            installmentsPaid: 0,
            totalInstallments: 4,
            approvedAt: 0,
            active: true
        });
        
        emit ClaimSubmitted(claimId, msg.sender, policy.tier);
    }

    /**
     * @dev Approves a claim (Owner only)
     */
    function approveClaim(uint256 claimId, uint256 payoutAmount) external onlyOwner {
        Claim storage claim = claims[claimId];
        require(claim.user != address(0), "Claim not found");
        require(claim.approvedAt == 0, "Already approved");
        
        claim.payoutAmount = payoutAmount;
        claim.approvedAt = block.timestamp;
        
        emit ClaimApproved(claimId, payoutAmount);
    }

    /**
     * @dev Processes installment payout (Owner only) 
     */
    function processInstallment(uint256 claimId) external onlyOwner {
        Claim storage claim = claims[claimId];
        require(claim.approvedAt > 0, "Not approved");
        require(claim.installmentsPaid < claim.totalInstallments, "Already completed");
        
        uint256 installmentAmount = claim.payoutAmount / claim.totalInstallments;
        claim.installmentsPaid++;
        
        if (claim.installmentsPaid >= claim.totalInstallments) {
            claim.active = false;
        }
        
        emit InstallmentPaid(claimId, claim.user, installmentAmount);
    }

    /**
     * @dev Withdraws funds (Owner only)
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        payable(owner).transfer(amount);
    }

    // View functions
    function getTier(uint256 tierId) external view returns (InsuranceTier memory) {
        return tiers[tierId];
    }

    function getUserPolicy(address user) external view returns (UserPolicy memory) {
        return policies[user];
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isRelayer(address addr) external view returns (bool) {
        return relayers[addr];
    }

    // Allow contract to receive BDG
    receive() external payable {}
}