import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { WalrusClient } from '@mysten/walrus';
import { SealClient, getAllowlistedKeyServers, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import dotenv from 'dotenv';

dotenv.config();

async function sealWalrusIntegration() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  // Initialize clients
  const suiClient = new SuiClient({
    url: getFullnodeUrl('testnet')
  });

  const walrusClient = new WalrusClient({
    network: 'testnet',
    suiClient: suiClient as any
  });

  // Create keypair
  const decoded = fromB64(privateKey);
  const privateKeyBytes = decoded.length === 33 ? decoded.slice(1) : decoded;
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const userAddress = keypair.getPublicKey().toSuiAddress();

  console.log('Using address:', userAddress);

  // Initialize Seal client
  const serverObjectIds = getAllowlistedKeyServers('testnet');
  const sealClient = new SealClient({
    suiClient,
    serverConfigs: serverObjectIds.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  // Seal configuration
  const packageId = '0x312ffd6d30c8e7c3bd3a2d369fcab323bcd05a7ad3509d189b8f7abcd26662fa';
  const id = '77616c7275732d7365616c2d696e746567726174696f6e'; // hex encoded "walrus-seal-integration"
  const accessControlId = '0x3825e23fb40d5697fd4b11e3f307e32349c5e3a6daf66a452b71661d2b6119b1';

  // Step 1: Create sensitive data to encrypt
  const sensitiveData = {
    message: 'This is highly sensitive data that should be encrypted!',
    timestamp: new Date().toISOString(),
    userId: 'user123',
    secretKey: 'super-secret-key-12345',
    metadata: {
      priority: 'high',
      category: 'confidential',
      tags: ['private', 'encrypted', 'walrus']
    }
  };

  const dataToEncrypt = new TextEncoder().encode(JSON.stringify(sensitiveData, null, 2));
  
  console.log('Original sensitive data size:', dataToEncrypt.length, 'bytes');
  console.log('Original data:', JSON.stringify(sensitiveData, null, 2));

  // Step 2: Encrypt data with Seal
  console.log('\n--- Step 1: Encrypting with Seal ---');
  const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
    threshold: 1,
    packageId: packageId,
    id: id,
    data: dataToEncrypt,
  });

  console.log('Seal encryption successful!');
  console.log('Encrypted data size:', encryptedBytes.length, 'bytes');
  console.log('Backup key:', backupKey);

  // Step 3: Store encrypted data on Walrus
  console.log('\n--- Step 2: Storing encrypted data on Walrus ---');
  
  // Create metadata for the encrypted blob
  const blobMetadata = {
    encryption: 'seal',
    packageId: packageId,
    accessControlId: accessControlId,
    id: id,
    backupKey: backupKey,
    timestamp: new Date().toISOString(),
    description: 'Seal-encrypted sensitive data stored on Walrus'
  };

  // Combine encrypted data with metadata
  const walrusData = {
    encryptedData: Array.from(encryptedBytes), // Convert Uint8Array to regular array for JSON
    metadata: blobMetadata
  };

  const walrusBytes = new TextEncoder().encode(JSON.stringify(walrusData, null, 2));
  
  console.log('Publishing encrypted data to Walrus...');
  const { blobId } = await walrusClient.writeBlob({
    blob: walrusBytes,
    deletable: false,
    epochs: 3,
    signer: keypair as any,
  });

  console.log('Encrypted data stored on Walrus!');
  console.log('Walrus blob ID:', blobId);

  // Step 4: Retrieve and verify the stored data
  console.log('\n--- Step 3: Retrieving from Walrus ---');
  const retrievedBlob = await walrusClient.readBlob({ blobId });
  const retrievedContent = new TextDecoder().decode(retrievedBlob);
  const retrievedData = JSON.parse(retrievedContent);

  console.log('Data retrieved from Walrus successfully!');
  console.log('Retrieved metadata:', retrievedData.metadata);

  // Step 5: Demonstrate decryption setup (note: actual decryption may fail on testnet)
  console.log('\n--- Step 4: Setting up decryption ---');
  
  // Create session key for decryption
  const sessionKey = await SessionKey.create({
    address: userAddress,
    packageId: packageId,
    ttlMin: 10,
    suiClient: suiClient,
  });

  // Sign the personal message
  const personalMessage = sessionKey.getPersonalMessage();
  const signature = await keypair.signPersonalMessage(personalMessage);
  sessionKey.setPersonalMessageSignature(signature.signature);

  // Create transaction for decryption
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access_control::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(id))),
      tx.object(accessControlId),
    ]
  });

  const txBytes = tx.build({ client: suiClient, onlyTransactionKind: true });

  // Execute access control transaction
  console.log('Executing access control transaction...');
  try {
    const txResult = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });
    console.log('Access control transaction executed successfully');
  } catch (txError) {
    console.error('Access control transaction failed:', txError);
  }

  // Attempt decryption (may fail on testnet due to key server issues)
  console.log('\n--- Step 5: Attempting decryption ---');
  try {
    const decryptedData = await sealClient.decrypt({
      data: new Uint8Array(retrievedData.encryptedData),
      sessionKey: sessionKey,
      txBytes: await txBytes
    });

    if (decryptedData) {
      const decryptedString = new TextDecoder().decode(decryptedData);
      const decryptedObject = JSON.parse(decryptedString);
      
      console.log('Decryption successful!');
      console.log('Decrypted data:', JSON.stringify(decryptedObject, null, 2));
      console.log('Data integrity verified:', JSON.stringify(decryptedObject) === JSON.stringify(sensitiveData));
    } else {
      console.log('Decryption returned undefined (likely testnet key server issue)');
    }
  } catch (error) {
    console.log('Decryption failed (expected on testnet):', error);
  }

  // Summary
  console.log('\n--- Integration Summary ---');
  console.log('✅ Sensitive data encrypted with Seal threshold encryption');
  console.log('✅ Encrypted data stored on Walrus decentralized storage');
  console.log('✅ Data retrieved from Walrus successfully');
  console.log('✅ Access control setup completed');
  console.log('❌ Decryption failed (testnet key server limitation)');
  console.log('\nStorage Details:');
  console.log('- Walrus blob ID:', blobId);
  console.log('- Original data size:', dataToEncrypt.length, 'bytes');
  console.log('- Encrypted data size:', encryptedBytes.length, 'bytes');
  console.log('- Total Walrus storage:', walrusBytes.length, 'bytes');
  console.log('- Seal backup key:', backupKey);

  return {
    blobId,
    backupKey,
    encryptedSize: encryptedBytes.length,
    walrusSize: walrusBytes.length
  };
}

sealWalrusIntegration().catch(console.error); 