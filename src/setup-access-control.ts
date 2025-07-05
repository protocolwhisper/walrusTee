import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

async function setupAccessControl() {
  const suiClient = new SuiClient({
    url: getFullnodeUrl('testnet')
  });

  // Create keypair from private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const decoded = fromB64(privateKey);
  const privateKeyBytes = decoded.length === 33 ? decoded.slice(1) : decoded;
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const address = keypair.getPublicKey().toSuiAddress();

  // Use the latest deployed package ID
  const packageId = '0x16f3e62e27ca6038c9c9c44b1c0bca434352e0143e0e7f7417b79dc4f76724d9';

  console.log('Creating AccessControl object for address:', address);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access_control::new`,
    arguments: []
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log('Transaction result:', result);
  
  // Find the AccessControl object ID
  const accessControlObject = result.objectChanges?.find(
    (change: any) => change.type === 'created' && change.objectType?.includes('AccessControl')
  );

  if (accessControlObject && 'objectId' in accessControlObject) {
    console.log('AccessControl object created with ID:', accessControlObject.objectId);
    console.log('\nUpdate your complete-seal-test.ts with:');
    console.log(`packageId: '${packageId}'`);
    console.log(`accessControlId: '${accessControlObject.objectId}'`);
  } else {
    console.log('Could not find AccessControl object in transaction result');
  }
}

setupAccessControl().catch(console.error); 