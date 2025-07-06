import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { WalrusClient } from '@mysten/walrus';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Version tracking file
const VERSION_FILE = 'versions.json';

interface VersionData {
  [filePath: string]: {
    lastVersion: string;
    lastUpdated: string;
    uploadCount: number;
  };
}

function loadVersionData(): VersionData {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const data = fs.readFileSync(VERSION_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Could not load version data:', error);
  }
  return {};
}

function saveVersionData(data: VersionData): void {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn('Could not save version data:', error);
  }
}

function incrementVersion(currentVersion: string): string {
  const parts = currentVersion.split('.');
  if (parts.length >= 3) {
    // Increment patch version (last number)
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  } else if (parts.length === 2) {
    // If only major.minor, add patch version
    return `${parts[0]}.${parts[1]}.1`;
  } else {
    // If single number, convert to major.minor.patch
    return `${currentVersion}.0.1`;
  }
}

function getNextVersion(filePath: string, manualVersion?: string): string {
  if (manualVersion) {
    return manualVersion;
  }

  const versionData = loadVersionData();
  const fileData = versionData[filePath];
  
  if (fileData) {
    return incrementVersion(fileData.lastVersion);
  }
  
  return '0.1.0';
}

function updateVersionData(filePath: string, version: string): void {
  const versionData = loadVersionData();
  
  if (!versionData[filePath]) {
    versionData[filePath] = {
      lastVersion: version,
      lastUpdated: new Date().toISOString(),
      uploadCount: 1
    };
  } else {
    versionData[filePath].lastVersion = version;
    versionData[filePath].lastUpdated = new Date().toISOString();
    versionData[filePath].uploadCount += 1;
  }
  
  saveVersionData(versionData);
}

async function uploadTarFile(
  walrusClient: WalrusClient,
  keypair: Ed25519Keypair,
  tarFilePath: string,
  version: string = '0.1'
) {
  console.log(`\n=== Uploading Tar File: ${tarFilePath} ===`);
  
  // Check if file exists
  if (!fs.existsSync(tarFilePath)) {
    throw new Error(`Tar file not found: ${tarFilePath}`);
  }

  // Get file stats
  const stats = fs.statSync(tarFilePath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`File size: ${fileSizeInMB} MB (${stats.size} bytes)`);
  console.log(`File type: ${path.extname(tarFilePath)}`);
  console.log(`Version: ${version}`);

  // Read the tar file
  console.log('Reading tar file...');
  const tarBuffer = fs.readFileSync(tarFilePath);
  const tarBytes = new Uint8Array(tarBuffer);

  console.log(`Tar file loaded into memory (${tarBytes.length} bytes)`);

  // Retry logic for network failures
  let retries = 3;
  let lastError: any;

  while (retries > 0) {
    try {
      console.log(`Attempt ${4 - retries}/3: Publishing tar file blob...`);
      
      // Publish the tar file as a blob to Walrus testnet
      const { blobId } = await walrusClient.writeBlob({
        blob: tarBytes,
        deletable: false,
        epochs: 3,
        signer: keypair as any,
      });

                    console.log(`Tar file published successfully!`);
       console.log(`Blob ID: ${blobId}`);
       console.log(`Original size: ${fileSizeInMB} MB`);
       console.log(`File: ${tarFilePath}`);
       console.log(`Version: ${version}`);

       // Read back the blob to verify
       console.log('Verifying blob integrity...');
       const readBlob = await walrusClient.readBlob({ blobId });
       
       if (readBlob.length === tarBytes.length) {
         console.log('Blob verification successful - sizes match!');
       } else {
         console.warn(`Size mismatch: Original ${tarBytes.length} bytes, Retrieved ${readBlob.length} bytes`);
       }

       return { blobId, originalSize: tarBytes.length, retrievedSize: readBlob.length, version };
      
    } catch (error) {
      lastError = error;
      retries--;
      
      if (retries > 0) {
        console.log(`Network error, retrying in 3 seconds... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

     if (retries === 0) {
     console.error('Failed to publish tar file blob after 3 attempts');
     console.error('Last error:', lastError);
    
    if (lastError instanceof Error) {
      console.error('Error details:', lastError.message);
    }
    throw lastError;
  }
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY is not set');
  }
  console.log('Initializing Walrus Blob Publisher...');

  // Initialize Sui client for testnet
  const suiClient = new SuiClient({
    url: getFullnodeUrl('testnet'),
  });

  // Initialize Walrus client
  const walrusClient = new WalrusClient({
    network: 'testnet',
    suiClient: suiClient  as any
  });

  console.log('Clients initialized successfully');

  // Create keypair from private key (handle base64 with flag)
  let keypair: Ed25519Keypair;
  try {
    // Your key is base64 with flag byte, need to extract just the private key part
    const decoded = fromB64(privateKey);
    if (decoded.length === 33) {
      // Remove the flag byte (first byte) and use the remaining 32 bytes
      const privateKeyBytes = decoded.slice(1);
      keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
      console.log('Successfully loaded keypair from base64 with flag');
    } else {
      // Fallback to direct usage
      keypair = Ed25519Keypair.fromSecretKey(privateKey);
    }
  } catch (error) {
    console.error('Error creating keypair:', error);
    throw error;
  }
  console.log(`Using address: ${keypair.getPublicKey().toSuiAddress()}`);

  // Check if a tar file path is provided as command line argument
  const tarFilePath = process.argv[2];
  const manualVersion = process.argv[3]; // Optional manual version override
  
  if (tarFilePath) {
    // Get auto-incremented version or use manual version
    const version = getNextVersion(tarFilePath, manualVersion);
    console.log(`Auto-detected version: ${version}`);
    
    // Upload the specified tar file
    try {
      const result = await uploadTarFile(walrusClient, keypair, tarFilePath, version);
      if (result) {
        console.log('\nTar file upload completed successfully!');
        console.log(`Blob ID: ${result.blobId}`);
        console.log(`Size: ${(result.originalSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`Version: ${result.version}`);
        updateVersionData(tarFilePath, result.version);
      }
    } catch (error) {
      console.error('Tar file upload failed:', error);
      process.exit(1);
    }
  } else {
    // Original JSON blob functionality
    console.log('\n=== Uploading Sample JSON Blob ===');
    
    // Create sample blob data
    const sampleData = {
      message: 'Hello from EthCannes!',
      timestamp: new Date().toISOString(),
      project: 'Walrus Blob Publisher',
      version: '1.0.0'
    };

    const blobContent = JSON.stringify(sampleData, null, 2);
    const blobBytes = new TextEncoder().encode(blobContent);

    console.log(`Publishing blob (${blobBytes.length} bytes)...`);

    // Retry logic for network failures
    let retries = 3;
    let lastError: any;

    while (retries > 0) {
      try {
        console.log(`Attempt ${4 - retries}/3: Publishing blob...`);
        
        // Publish the blob to Walrus testnet
        const { blobId } = await walrusClient.writeBlob({
          blob: blobBytes,
          deletable: false,
          epochs: 3,
          signer: keypair as any,
        });

        console.log(`Blob published successfully! ID: ${blobId}`);

        // Read back the blob to verify
        const readBlob = await walrusClient.readBlob({ blobId });
        const readContent = new TextDecoder().decode(readBlob);
        
        console.log('Blob verification successful');
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error;
        retries--;
        
        if (retries > 0) {
          console.log(`Network error, retrying in 2 seconds... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (retries === 0) {
      console.error('Failed to publish blob after 3 attempts');
      console.error('Last error:', lastError);
      
      if (lastError instanceof Error) {
        console.error('Error details:', lastError.message);
      }
    }
  }
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 