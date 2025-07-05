import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

async function deployPackage() {
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

  console.log('Deploying package for address:', address);

  // Step 1: Build the Move package
  console.log('Building Move package...');
  const { execSync } = require('child_process');
  
  try {
    execSync('cd src/move && sui move build', { stdio: 'inherit' });
    console.log('Move package built successfully');
  } catch (error) {
    console.error('Failed to build Move package:', error);
    return;
  }

  // Step 2: Deploy the package
  console.log('Deploying package to testnet...');
  try {
    const deployResult = execSync('cd src/move && sui client publish --gas-budget 10000000', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    console.log('Deploy result:', deployResult);
    
    // Extract package ID from the output
    const packageIdMatch = deployResult.match(/Created Objects:[\s\S]*?ID: (0x[a-fA-F0-9]{64})/);
    if (packageIdMatch) {
      const packageId = packageIdMatch[1];
      console.log('Package deployed with ID:', packageId);
      
      // Step 3: Create AccessControl object
      console.log('Creating AccessControl object...');
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

      console.log('AccessControl creation result:', result);
      
      // Find the AccessControl object ID
      const accessControlObject = result.objectChanges?.find(
        (change: any) => change.type === 'created' && change.objectType?.includes('AccessControl')
      );

      if (accessControlObject && 'objectId' in accessControlObject) {
        console.log('\n✅ Setup complete!');
        console.log('Package ID:', packageId);
        console.log('AccessControl object ID:', accessControlObject.objectId);
        console.log('\nUpdate your complete-seal-test.ts with:');
        console.log(`packageId: '${packageId}'`);
        console.log(`accessControlId: '${accessControlObject.objectId}'`);
      } else {
        console.log('Could not find AccessControl object in transaction result');
      }
    } else {
      console.log('Could not extract package ID from deploy result');
    }
  } catch (error) {
    console.error('Failed to deploy package:', error);
  }
}

deployPackage().catch(console.error); 