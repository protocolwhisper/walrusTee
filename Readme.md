# EthCannes - Rust Compiler with Walrus Storage

![System Architecture](https://i.ibb.co/QFZzSFrq/ZKtee-landscape2.png)

## Overview

EthCannes provides a secure Rust compiler API that integrates with **Walrus Storage** for encrypted file handling. The system allows users to upload, store, retrieve, and execute Rust projects in a privacy-preserving manner.

**Note**: This will be accessed via the IP of the Oasis CVM later.

## Architecture

The system consists of two main components running in a single Docker container:

1. **Rust Compiler API** (Port 3001) - Handles project compilation and execution
2. **Walrus Storage API** (Port 3002) - Encrypted file storage system

## API Endpoints (main.rs)

### Rust Compiler API

```bash
# Health check
curl http://localhost:3001/health

# Run a Rust project
curl -X POST -F "tar_file=@project.tar.gz" \
  -F "args=10" \
  http://localhost:3001/run/USER_ID/PROJECT_ID

# Upload to Walrus storage
curl -X POST -F "file=@project.tar.gz" \
  -F "fileName=my-project.tar.gz" \
  -F "description=Rust Project" \
  -F "tags=rust,project" \
  http://localhost:3001/walrus/upload

# Retrieve from Walrus storage
curl -X GET http://localhost:3001/walrus/retrieve/BLOB_ID -o retrieved-project.tar.gz

# Get file info from Walrus
curl -X GET http://localhost:3001/walrus/info/BLOB_ID
```

## Quick Test

```bash
# Build and run
docker build -t rustcompiler-walrus:latest .
docker run -d -p 3001:3001 -p 3002:3002 --name rustcompiler-test rustcompiler-walrus:latest

# Test Fibonacci Prime project
curl -X POST -F "tar_file=@fibonacci-prime.tar.gz" \
  -F "args=10" \
  http://localhost:3001/run/user123/project456
```

## Oasis Sapphire Deployment

**Contract**: `rofl1qpf4w7q5pretch772cler9rdspdg4enm4syfqn2v`  
**Explorer**: [Oasis Explorer](https://explorer.oasis.io/testnet/sapphire/rofl/app/rofl1qpf4w7q5pretch772cler9rdspdg4enm4syfqn2v?q=rofl1qpf4w7q5pretch772cler9rdspdg4enm4syfqn2v)

## Technology

- **Rust**: Core compiler API
- **Typescrip**: Walrus storage
- **Docker**: Containerization
- **Oasis Sapphire**: Confidential computing