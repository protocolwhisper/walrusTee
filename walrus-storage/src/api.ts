import express from 'express';
import multer from 'multer';
import { SimpleStorage } from './simple-storage';
import * as path from 'path';
import * as fs from 'fs';

const app: express.Express = express();
const port = process.env.PORT || 3002;

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Initialize storage
const storage = new SimpleStorage();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Walrus Storage API is running',
    address: storage.getAddress()
  });
});

// Balance check endpoint
app.get('/balance', async (req, res) => {
  try {
    const balance = await storage.getBalance();
    res.json({
      success: true,
      address: storage.getAddress(),
      balance: balance,
      message: 'Balance retrieved successfully'
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ 
      error: 'Failed to get balance',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload tar file endpoint
app.post('/upload', upload.single('tarFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const description = req.body.description || 'Uploaded tar file';
    const tags = req.body.tags ? req.body.tags.split(',') : ['uploaded', 'tar'];

    console.log('Uploading file:', file.originalname);
    console.log('File size:', file.size, 'bytes');

    // Store the file using our SimpleStorage
    const blobId = await storage.storeFile(
      file.path,
      description,
      tags
    );

    // Clean up the temporary file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      blobId: blobId,
      fileName: file.originalname,
      fileSize: file.size,
      description: description,
      tags: tags,
      message: 'File uploaded successfully to Walrus'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Retrieve file endpoint
app.get('/retrieve/:blobId', async (req, res) => {
  try {
    const { blobId } = req.params;
    const fileName = req.query.fileName as string || 'retrieved-file.tar.gz';

    if (!blobId) {
      return res.status(400).json({ error: 'Blob ID is required' });
    }

    console.log('Retrieving blob:', blobId);

    // Create a temporary file path
    const tempDir = 'downloads';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputPath = path.join(tempDir, fileName);

    // Retrieve the file
    await storage.retrieveFile(blobId, outputPath);

    // Send the file
    res.download(outputPath, fileName, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up the temporary file after sending
      fs.unlinkSync(outputPath);
    });

  } catch (error) {
    console.error('Retrieve error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get file info endpoint (without downloading)
app.get('/info/:blobId', async (req, res) => {
  try {
    const { blobId } = req.params;

    if (!blobId) {
      return res.status(400).json({ error: 'Blob ID is required' });
    }

    console.log('Getting info for blob:', blobId);

    // Read the blob to get metadata
    const blob = await storage['walrusClient'].readBlob({ blobId });
    const separator = '\n---WALRUS_META_SEPARATOR---\n';
    const blobStr = new TextDecoder().decode(blob);
    const sepIdx = blobStr.indexOf(separator);

    if (sepIdx === -1) {
      return res.status(400).json({ error: 'Invalid blob format' });
    }

    const metaStr = blobStr.slice(0, sepIdx);
    const meta = JSON.parse(metaStr);

    res.json({
      success: true,
      blobId: blobId,
      metadata: meta,
      fileSize: blob.length,
      message: 'File info retrieved successfully'
    });

  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ 
      error: 'Failed to get file info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Walrus Storage API running on port ${port}`);
  console.log('Available endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  GET  /balance - Balance check');
  console.log('  POST /upload - Upload tar file');
  console.log('  GET  /retrieve/:blobId - Download file');
  console.log('  GET  /info/:blobId - Get file info');
});

export default app; 