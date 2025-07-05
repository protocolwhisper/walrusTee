import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { SealClient, getAllowlistedKeyServers, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import dotenv from 'dotenv';

dotenv.config();

async function completeSealTest() {
  const suiClient = new SuiClient({
    url: getFullnodeUrl('testnet')
  });

  const serverObjectIds = getAllowlistedKeyServers('testnet');
  console.log('Key servers for testnet:', serverObjectIds);
  
  const sealClient = new SealClient({
    suiClient,
    serverConfigs: serverObjectIds.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  const packageId = '0x312ffd6d30c8e7c3bd3a2d369fcab323bcd05a7ad3509d189b8f7abcd26662fa';
  const id = '53e66d756e6472206672f3f069';
  const userAddress = '0x2af31ffeb3f7ad258ff0413cc8e47fe38c7613775e58c133c731f0777a5d1df3';
  const accessControlId = '0x3825e23fb40d5697fd4b11e3f307e32349c5e3a6daf66a452b71661d2b6119b1';
  
  const originalData = 'Hello from EthCannes! This is a test message.';
  const dataToEncrypt = new TextEncoder().encode(originalData);
  
  console.log('Original data:', originalData);
  
  // Step 1: Encrypt
  const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
    threshold: 1,
    packageId: packageId,
    id: id,
    data: dataToEncrypt,
  });
  
  console.log('Encryption successful!');
  
  // Step 2: Create session key
  const sessionKey = await SessionKey.create({
    address: userAddress,
    packageId: packageId,
    ttlMin: 10,
    suiClient: suiClient,
  });
  
  // Step 3: Sign the personal message
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }
  
  const decoded = fromB64(privateKey);
  const privateKeyBytes = decoded.length === 33 ? decoded.slice(1) : decoded;
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  
  const personalMessage = sessionKey.getPersonalMessage();
  const signature = await keypair.signPersonalMessage(personalMessage);
  sessionKey.setPersonalMessageSignature(signature.signature);
  
  // Step 4: Create transaction for decryption
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access_control::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(id))),
      tx.object(accessControlId),
    ]
  });
  
  const txBytes = tx.build({ client: suiClient, onlyTransactionKind: true });
  
  // Let's also try executing the transaction first to see if that helps
  console.log('Executing access control transaction...');
  try {
    const txResult = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });
    console.log('Transaction executed successfully:', txResult.effects?.status);
  } catch (txError) {
    console.error('Transaction execution failed:', txError);
  }
  
  // Step 5: Decrypt the data
  try {
    console.log('Attempting decryption...');
    console.log('Session key personal message:', sessionKey.getPersonalMessage());
    console.log('Transaction bytes length:', (await txBytes).length);
    
    // Wait a bit for the transaction to be processed
    console.log('Waiting for transaction confirmation...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const decryptedData = await sealClient.decrypt({
      data: encryptedBytes,
      sessionKey: sessionKey,
      txBytes: await txBytes
    });
    
    if (!decryptedData) {
      console.error('Decryption returned undefined/null');
      console.log('This might indicate:');
      console.log('1. Key servers are not responding');
      console.log('2. Access control is not properly configured');
      console.log('3. Session key is not valid');
      console.log('4. Transaction format is incorrect');
      return;
    }
    
    const decryptedString = new TextDecoder().decode(decryptedData);
    console.log('Decryption successful!');
    console.log('Decrypted data:', decryptedString);
    console.log('Match:', originalData === decryptedString);
    
  } catch (error) {
    console.error('Decryption failed:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error?.constructor?.name);
    console.error('Error message:', (error as any)?.message);
    console.error('Error stack:', (error as any)?.stack);
  }
  
  return { encryptedBytes, sessionKey, txBytes, originalData };
}

completeSealTest().catch(console.error); 