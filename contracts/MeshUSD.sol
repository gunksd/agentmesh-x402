// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title MeshUSD
 * @notice Settlement token for AgentMesh on BSC Testnet.
 *
 * Six decimals to match USDC, and an open `mint` so a reviewer can fund a wallet
 * without chasing a faucet. On mainnet this is replaced by real USDC
 * (0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d) — no other code changes.
 *
 * Deliberately minimal: a permissionless mint would be reckless on mainnet, and
 * that is exactly why this contract is testnet-only.
 */
contract MeshUSD {
    string public constant name = "AgentMesh USD";
    string public constant symbol = "mUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    /// @notice Mints to any address. Testnet faucet, open by design.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Moves tokens on behalf of `from`.
     * @dev This is the path Permit2 takes when settling an x402 payment: the
     *      payer approves Permit2 once, then every later transfer is authorised
     *      by an off-chain signature instead of a new on-chain approval.
     */
    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();

        // Treat max allowance as infinite so a one-time approve keeps working.
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();

        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
