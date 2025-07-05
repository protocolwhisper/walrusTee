# EthCannes Seal Encryption/Decryption

This project demonstrates how to use Sui's Seal threshold encryption system for secure data encryption and decryption with access control.

## What is Seal?

Seal is Sui's threshold encryption system that allows you to:
- Encrypt data with threshold encryption (split keys across multiple servers)
- Control access through Move smart contracts
- Decrypt data only with proper authorization and key server cooperation

## Project Structure

```
src/
├── index.ts                    # Main Walrus blob publisher
├── complete-seal-test.ts       # Complete Seal encryption/decryption demo
└── move/                       # Move smart contract for access control
    ├── Move.toml              # Package configuration
    └── sources/
        └── access_control.move # Seal access control contract
```

## How It Works

### 1. Encryption Process

Seal encrypts data using threshold encryption:
- Your data is converted to bytes (Uint8Array)
- Encryption key is split across multiple key servers
- Only threshold number of key servers need to cooperate for decryption
- Encrypted data can be stored anywhere (on-chain, Walrus, etc.)

### 2. Access Control

Access is controlled through Move smart contracts:
- Each encryption is tied to a specific package ID and ID
- Move contract contains `seal_approve*` functions
- These functions define who can decrypt the data
- Examples: NFT ownership, token balance, whitelist membership

### 3. Decryption Process

Decryption requires multiple steps:
1. **Session Key Creation**: User creates time-limited session
2. **Wallet Approval**: User signs message in wallet to approve session
3. **Access Control Check**: Move contract validates access permissions
4. **Key Retrieval**: App fetches key shares from key servers
5. **Decryption**: Shares are combined to reconstruct original key

## Data Types Supported

Seal can encrypt any data that can be converted to bytes:
- **Strings**: "Hello from EthCannes!"
- **JSON**: Structured data as strings
- **Binary**: Raw bytes, images, files
- **Any data type** convertible to Uint8Array

## Usage

### Prerequisites

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
# Create .env file with your private key
PRIVATE_KEY=your_base64_encoded_private_key
```

### Running the Demo

1. Deploy the Move contract:
```bash
cd src/move
sui move build
sui client publish --gas-budget 10000000
```

2. Update the package ID in `complete-seal-test.ts` with the deployed package ID

3. Run the complete test:
```bash
pnpm ts-node src/complete-seal-test.ts
```

## Key Components

### Move Contract (`access_control.move`)

Contains the `seal_approve` function that Seal calls to verify access:
```move
public fun seal_approve(_id: vector<u8>, access_control: &AccessControl) {
    // Define your access control logic here
    // Examples: check NFT ownership, token balance, etc.
}
```

### Seal Client Configuration

```typescript
const sealClient = new SealClient({
  suiClient,
  serverConfigs: serverObjectIds.map((id) => ({
    objectId: id,
    weight: 1,
  })),
  verifyKeyServers: false,
});
```

### Encryption

```typescript
const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
  threshold: 1, // Number of key servers needed
  packageId: '0x...', // Deployed Move package ID
  id: 'your_access_control_id',
  data: dataToEncrypt, // Uint8Array
});
```

### Decryption Setup

```typescript
// Create session key
const sessionKey = await SessionKey.create({
  address: userAddress,
  packageId: packageId,
  ttlMin: 10, // Time to live in minutes
  suiClient: suiClient,
});

// User signs personal message in wallet
// sessionKey.setPersonalMessageSignature(signature);

// Create transaction with seal_approve call
const tx = new Transaction();
tx.moveCall({
  target: `${packageId}::access_control::seal_approve`,
  arguments: [tx.pure.vector("u8", Array.from(idBytes))]
});

// Decrypt
const decryptedData = await sealClient.decrypt({
  data: encryptedBytes,
  sessionKey: sessionKey,
  txBytes: tx.build({ client: suiClient, onlyTransactionKind: true })
});
```

## Security Features

- **Threshold Encryption**: Keys split across multiple servers
- **Access Control**: On-chain verification through Move contracts
- **Session Management**: Time-limited access sessions
- **Wallet Integration**: User approval required for decryption
- **Key Server Cooperation**: Multiple servers must cooperate

## Next Steps

To complete the implementation:
1. Integrate with user wallet (sign personal message)
2. Implement proper access control logic in Move contract
3. Handle AccessControl object creation and management
4. Add error handling and retry logic
5. Implement proper session key storage and management

## Resources

- [Seal Documentation](https://docs.sui.io/guides/developer/advanced/seal)
- [Sui Move Documentation](https://docs.sui.io/guides/developer/move)
- [Seal SDK](https://www.npmjs.com/package/@mysten/seal) 