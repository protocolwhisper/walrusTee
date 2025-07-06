#!/bin/bash

# Function to handle shutdown
function cleanup {
    echo "Shutting down servers..."
    if [ ! -z "$WALRUS_PID" ]; then
        kill $WALRUS_PID
        echo "Walrus Storage API stopped"
    fi
    if [ ! -z "$RUST_PID" ]; then
        kill $RUST_PID
        echo "Rust Compiler stopped"
    fi
    exit 0
}

# Catch signals
trap cleanup SIGINT SIGTERM

case "$1" in
    "serve")
        echo "Starting both Walrus Storage API and Rust Compiler..."
        
        # Start the Walrus Storage API (Node.js) in the background
        cd /app/walrus-storage
        echo "Starting Walrus Storage API on port 3002..."
        PORT=3002 pnpm run api &
        WALRUS_PID=$!
        
        # Wait longer for Walrus API to fully start
        echo "Waiting for Walrus Storage API to start..."
        sleep 5
        
        # Check if Walrus API is running
        if ! kill -0 $WALRUS_PID 2>/dev/null; then
            echo "ERROR: Walrus Storage API failed to start"
            exit 1
        fi
        
        # Start the Rust Compiler application
        cd /app/rustcompiler
        echo "Starting Rust Compiler on port 3001..."
        PORT=3001 /app/rustcompiler/target/release/rustTeeCompiler &
        RUST_PID=$!
        
        # Wait a moment for Rust app to start
        sleep 2
        
        # Check if Rust app is running
        if ! kill -0 $RUST_PID 2>/dev/null; then
            echo "ERROR: Rust Compiler failed to start"
            kill $WALRUS_PID 2>/dev/null
            exit 1
        fi
        
        # Keep the script running to maintain both processes
        echo "Both servers are running:"
        echo "  - Walrus Storage API: http://localhost:3002"
        echo "  - Rust Compiler: http://localhost:3001"
        echo "Press Ctrl+C to stop."
        wait
        ;;
    
    "build")
        echo "Building Rust application..."
        cd /app/rustcompiler
        cargo build --release
        echo "Building Walrus Storage API..."
        cd /app/walrus-storage
        pnpm install 
        pnpm run build
        echo "Build complete!"
        ;;
    
    "test")
        echo "Running tests..."
        cd /app/rustcompiler
        cargo test
        cd /app/walrus-storage
        pnpm test
        ;;
    
    *)
        echo "Usage: $0 {serve|build|test}"
        echo "  serve - Start both servers"
        echo "  build - Build both applications"
        echo "  test  - Run tests"
        exit 1
        ;;
esac
