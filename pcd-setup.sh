#!/bin/bash
# Private Contact Discovery on Arcium -- Development Environment Setup
# Run this script in WSL/Ubuntu to install all prerequisites
# Usage: bash pcd-setup.sh

set -e

echo "=== Private Contact Discovery - Dev Environment Setup ==="
echo ""

# Step 1: System dependencies
echo "[1/6] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y curl build-essential pkg-config libssl-dev libudev-dev git

# Step 2: Rust
echo "[2/6] Installing Rust..."
if ! command -v rustc &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust already installed: $(rustc --version)"
fi

# Step 3: Solana CLI
echo "[3/6] Installing Solana CLI v2.3.0..."
if ! command -v solana &> /dev/null; then
    sh -c "$(curl -sSfL https://release.anza.xyz/v2.3.0/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
else
    echo "Solana already installed: $(solana --version)"
fi

# Step 4: Node.js 20 + npm
echo "[4/6] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# Step 5: Anchor
echo "[5/6] Installing Anchor 0.32.1..."
if ! command -v anchor &> /dev/null; then
    cargo install --git https://github.com/coral-xyz/anchor avm --force
    avm install 0.32.1
    avm use 0.32.1
else
    echo "Anchor already installed: $(anchor --version)"
fi

# Step 6: Arcium CLI
echo "[6/6] Installing Arcium CLI..."
if ! command -v arcium &> /dev/null; then
    curl -sSf https://install.arcium.com | sh
    export PATH="$HOME/.arcium/bin:$PATH"
    echo 'export PATH="$HOME/.arcium/bin:$PATH"' >> ~/.bashrc
else
    echo "Arcium already installed: $(arcium --version)"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. cd private-contact-discovery"
echo "  2. arcium build"
echo "  3. arcium test"
echo "  4. arcium deploy  (to devnet)"
echo ""
echo "For the frontend:"
echo "  1. cd private-contact-discovery-frontend"
echo "  2. npm install"
echo "  3. npm run dev"
echo ""
echo "Make sure to generate a Solana keypair if needed:"
echo "  solana-keygen new"
echo "  solana config set --url devnet"
echo "  solana airdrop 2"
