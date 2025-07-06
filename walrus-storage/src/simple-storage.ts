import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { WalrusClient } from '@mysten/walrus';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

interface StorageData {
  content: any;
  timestamp: string;
  description?: string;
  tags?: string[];
}

class SimpleStorage {
  private suiClient: SuiClient;
  private walrusClient: WalrusClient;
  private keypair: Ed25519Keypair;

  constructor() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    this.suiClient = new SuiClient({
      url: getFullnodeUrl('testnet')
    });

    this.walrusClient = new WalrusClient({
      network: 'testnet',
      suiClient: this.suiClient as any
    });

    const decoded = fromB64(privateKey);
    const privateKeyBytes = decoded.length === 33 ? decoded.slice(1) : decoded;
    this.keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  }

  async store(data: any, description?: string, tags?: string[]): Promise<string> {
    const storageData: StorageData = {
      content: data,
      timestamp: new Date().toISOString(),
      description,
      tags
    };

    const jsonData = JSON.stringify(storageData, null, 2);
    const bytes = new TextEncoder().encode(jsonData);

    console.log('Storing data...');
    console.log('Data size:', bytes.length, 'bytes');
    console.log('Description:', description || 'No description');

    const { blobId } = await this.walrusClient.writeBlob({
      blob: bytes,
      deletable: false,
      epochs: 3,
      signer: this.keypair as any,
    });

    console.log('Data stored successfully!');
    console.log('Blob ID:', blobId);
    return blobId;
  }

  async retrieve(blobId: string): Promise<any> {
    console.log('Retrieving data from blob ID:', blobId);
    
    const blob = await this.walrusClient.readBlob({ blobId });
    const content = new TextDecoder().decode(blob);
    const data: StorageData = JSON.parse(content);

    console.log('Data retrieved successfully!');
    console.log('Timestamp:', data.timestamp);
    console.log('Description:', data.description || 'No description');
    console.log('Tags:', data.tags || []);

    return data.content;
  }

  async listRecentBlobs(limit: number = 10): Promise<string[]> {
    // Note: Walrus doesn't have a direct list method, so this is a placeholder
    // In a real implementation, you'd need to track blob IDs separately
    console.log('Listing recent blobs (placeholder - not implemented in Walrus)');
    return [];
  }

  getAddress(): string {
    return this.keypair.getPublicKey().toSuiAddress();
  }

  async storeFile(filePath: string, description?: string, tags?: string[]): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const storageData = {
      fileName,
      timestamp: new Date().toISOString(),
      description,
      tags
    };

    // Combine metadata and file content
    const metaBytes = new TextEncoder().encode(JSON.stringify(storageData));
    const separator = Buffer.from('\n---WALRUS_META_SEPARATOR---\n');
    const combined = Buffer.concat([metaBytes, separator, fileBuffer]);

    const { blobId } = await this.walrusClient.writeBlob({
      blob: combined,
      deletable: false,
      epochs: 3,
      signer: this.keypair as any,
    });

    console.log('File stored successfully!');
    console.log('Blob ID:', blobId);
    return blobId;
  }

  async retrieveFile(blobId: string, outputPath: string): Promise<void> {
    const blob = await this.walrusClient.readBlob({ blobId });
    const separator = '\n---WALRUS_META_SEPARATOR---\n';
    const blobStr = new TextDecoder().decode(blob);
    const sepIdx = blobStr.indexOf(separator);

    if (sepIdx === -1) {
      throw new Error('Invalid blob format');
    }

    const metaStr = blobStr.slice(0, sepIdx);
    const meta = JSON.parse(metaStr);
    const fileBuffer = Buffer.from(blob).slice(Buffer.byteLength(metaStr + separator));

    fs.writeFileSync(outputPath, fileBuffer);
    console.log(`File retrieved and saved to ${outputPath}`);
    console.log('Metadata:', meta);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage:');
    console.log('  npm run store <data> [description] [tags...]');
    console.log('  npm run retrieve <blobId>');
    console.log('  npm run list');
    console.log('  npm run store-file <filePath> [description] [tags...]');
    console.log('  npm run retrieve-file <blobId> <outputPath>');
    return;
  }

  const storage = new SimpleStorage();
  console.log('Using address:', storage.getAddress());

  try {
    switch (command) {
      case 'store':
        const data = args[1];
        const description = args[2];
        const tags = args.slice(3);
        
        if (!data) {
          console.log('Error: Data is required for store command');
          return;
        }

        const blobId = await storage.store(data, description, tags);
        console.log('Stored with blob ID:', blobId);
        break;

      case 'retrieve':
        const blobIdToRetrieve = args[1];
        if (!blobIdToRetrieve) {
          console.log('Error: Blob ID is required for retrieve command');
          return;
        }

        const retrievedData = await storage.retrieve(blobIdToRetrieve);
        console.log('Retrieved data:', retrievedData);
        break;

      case 'store-file':
        const filePath = args[1];
        if (!filePath) {
          console.log('Error: File path is required for store-file command');
          return;
        }
        const desc = args[2];
        const fileTags = args.slice(3);
        const fileBlobId = await storage.storeFile(filePath, desc, fileTags);
        console.log('Stored file with blob ID:', fileBlobId);
        break;

      case 'retrieve-file':
        const blobIdToRetrieveFile = args[1];
        const outputPath = args[2];
        if (!blobIdToRetrieveFile || !outputPath) {
          console.log('Error: Blob ID and output path are required for retrieve-file command');
          return;
        }
        await storage.retrieveFile(blobIdToRetrieveFile, outputPath);
        break;

      case 'list':
        const blobs = await storage.listRecentBlobs();
        console.log('Recent blobs:', blobs);
        break;

      default:
        console.log('Unknown command:', command);
        break;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Export for use as module
export { SimpleStorage };

// Run if called directly
if (require.main === module) {
  main();
} 