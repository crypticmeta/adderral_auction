# Multiwallet Integration Documentation

## Overview

This document describes the multiwallet functionality implemented in the Acorn Auction platform. The multiwallet feature allows users to connect both standard Bitcoin addresses and Taproot addresses to their accounts, enabling more flexible transaction options.

## Backend Implementation

### API Endpoints

- **POST /api/auction/connect-multi-wallet**
  - Connects a multiwallet to a user account
  - Requires JWT authentication
  - Handles both standard BTC addresses and Taproot addresses

### Request Format

```json
{
  "userId": "user-123",
  "btcAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "taprootAddress": "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  "publicKey": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "network": "testnet",
  "signature": "signature_for_verification"
}
```

### Response Format

**Success (200 OK)**
```json
{
  "id": "user-123",
  "btcAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "taprootAddress": "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  "publicKey": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "network": "testnet"
}
```

**Error (400 Bad Request)**
```json
{
  "message": "User ID, BTC address, Taproot address, and public key are required"
}
```

**Error (400 Bad Request)**
```json
{
  "message": "Wallet ownership verification failed"
}
```

**Error (500 Internal Server Error)**
```json
{
  "message": "Server error connecting multi-wallet"
}
```

### Data Model

The User model in the Prisma schema has been updated to include the `taprootAddress` field:

```prisma
model User {
  id             String   @id
  btcAddress     String?
  taprootAddress String?  // Added for multiwallet support
  publicKey      String?
  network        String?  // 'mainnet', 'testnet', or 'regtest'
  createdAt      DateTime @default(now())
  pledges        Pledge[]
}
```

## Frontend Implementation

A React component `MultiWalletConnect.tsx` has been created to handle the UI for connecting a multiwallet. The component includes:

- Form fields for BTC address, Taproot address, and public key
- Network selection (mainnet, testnet, regtest)
- Error handling and success messaging
- Loading state management

A dedicated page at `/wallet/connect` has been created to use this component.

## Usage Example

### Backend

```typescript
// Import the controller
import { connectMultiWallet } from '../controllers/auctionController';

// Set up the route
router.post('/connect-multi-wallet', authenticateJWT, connectMultiWallet);
```

### Frontend

```typescript
import MultiWalletConnect from '../components/MultiWalletConnect';

function WalletPage() {
  const userId = "user-123"; // Get from auth context

  const handleConnect = (userData) => {
    console.log('Wallet connected:', userData);
    // Update app state or redirect
  };

  return (
    <div>
      <h1>Connect Your Wallet</h1>
      <MultiWalletConnect 
        userId={userId} 
        onConnect={handleConnect} 
      />
    </div>
  );
}
```

## Security Considerations

1. **Wallet Ownership Verification**: The system verifies wallet ownership using the BitcoinWalletService before updating user data.

2. **JWT Authentication**: All wallet connection endpoints require JWT authentication.

3. **Input Validation**: The API validates that all required fields are present before processing.

## Testing

A test script has been created at `src/tests/multiWalletTest.ts` that provides a reusable function for testing the multiwallet connection functionality.

```typescript
import { connectMultiWallet } from './multiWalletTest';

const multiWalletData = {
  userId: '12345',
  btcAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  taprootAddress: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  network: 'testnet',
  signature: 'sample_signature'
};

connectMultiWallet('http://localhost:3000', multiWalletData, 'your-jwt-token')
  .then(result => console.log('Multi-wallet connected:', result))
  .catch(error => console.error('Failed to connect multi-wallet:', error));
```
