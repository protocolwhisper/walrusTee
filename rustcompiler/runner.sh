#!/bin/bash
set -e

# First argument is the command (compile or run)
ACTION=$1

case $ACTION in  
  run)
    # Second argument is the project directory
    PROJECT_DIR=$2
    cd $PROJECT_DIR
    echo "Running project with cargo run --release in: $PROJECT_DIR" >&2
    
    # Check Cargo.toml exists
    if [ ! -f "Cargo.toml" ]; then
        echo "ERROR: Cargo.toml not found in $PROJECT_DIR" >&2
        exit 1
    fi
    
    # Pass all remaining arguments to cargo run
    shift 2  # Remove the action and project_dir arguments
    echo "Executing: cargo run --release $@" >&2
    cargo run --release "$@"
    exit $?
    ;;
    
  serve)
    # This action starts both the RA server and Rust application
    # Start the Node.js RA server in the background
    cd /app
    echo "Starting Node.js RA Report server..."
    node index.js &
    NODE_PID=$!
    
    # Start the Rust application using the 'run' function
    cd /app/rustcompiler
    echo "Starting Rust application..."
    cargo run --release &
    RUST_PID=$!
    
    # Function to handle shutdown
    function cleanup {
      echo "Shutting down servers..."
      kill $NODE_PID
      kill $RUST_PID
      exit 0
    }
    
    # Catch signals
    trap cleanup SIGINT SIGTERM
    
    # Keep the script running to maintain both processes
    echo "Both servers are running. Press Ctrl+C to stop."
    wait
    ;;
    
  *)
    echo "Usage: $0 compile project_directory OR $0 run project_directory [args...] OR $0 serve"
    exit 1
    ;;
esac 