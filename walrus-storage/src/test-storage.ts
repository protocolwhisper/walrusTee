import { SimpleStorage } from './simple-storage';
import * as path from 'path';

async function testStorage() {
  console.log('Testing Simple Storage with Walrus...');
  
  const storage = new SimpleStorage();
  console.log('Using address:', storage.getAddress());

  try {
    // Test with fibonacci-prime.tar.gz from root directory
    const tarFilePath = path.join(__dirname, '../../fibonacci-prime.tar.gz');
    
    console.log('\n--- Storing Tar File ---');
    console.log('File path:', tarFilePath);
    
    const blobId = await storage.storeFile(
      tarFilePath,
      'Fibonacci Prime Rust Project',
      ['rust', 'fibonacci', 'project', 'tar']
    );

    console.log('\n--- Retrieving Tar File ---');
    const outputPath = path.join(__dirname, '../../retrieved-fibonacci-prime.tar.gz');
    await storage.retrieveFile(blobId, outputPath);

    console.log('\n--- Verification ---');
    console.log('Original file:', tarFilePath);
    console.log('Retrieved file:', outputPath);
    console.log('File stored and retrieved successfully!');

    console.log('\n--- Summary ---');
    console.log('Blob ID for future retrieval:', blobId);
    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testStorage(); 