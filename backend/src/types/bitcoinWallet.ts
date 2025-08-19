/**
 * Types for Bitcoin wallet adapter integration
 */

// Bitcoin wallet information
export interface BitcoinWalletInfo {
  address: string;         // Standard BTC address
  taprootAddress?: string; // Taproot address (if available)
  publicKey: string;       // Public key of the wallet
  network: 'mainnet' | 'testnet' | 'regtest';
}

// Transaction information
export interface BitcoinTransaction {
  txid: string;           // Transaction ID
  amount: number;         // Amount in BTC
  fee: number;            // Transaction fee
  confirmations: number;  // Number of confirmations
  timestamp: Date;        // Transaction timestamp
  sender: string;         // Sender address
  recipient: string;      // Recipient address
  status: 'pending' | 'confirmed' | 'failed';
}

// Pledge information from wallet
export interface WalletPledge {
  walletInfo: BitcoinWalletInfo;
  pledgeAmount: number;    // Amount pledged in BTC
  depositAddress: string;  // Address to deposit funds
  transaction?: BitcoinTransaction; // Transaction details if payment is made
  signature: string;       // Signature to verify wallet ownership
  timestamp: Date;         // Pledge timestamp
}

// Bitcoin payment request
export interface BitcoinPaymentRequest {
  amount: number;          // Amount to pay in BTC
  recipient: string;       // Recipient address
  memo?: string;           // Optional memo/description
  callbackUrl?: string;    // Callback URL for payment notification
}

// Bitcoin payment response
export interface BitcoinPaymentResponse {
  success: boolean;
  transaction?: BitcoinTransaction;
  error?: string;
}
