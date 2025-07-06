# Build stage
FROM rust:latest AS builder
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    nodejs \
    npm \
    curl \
    python3-minimal \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Make sure we have a recent Node.js version
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Copy source code
COPY rustcompiler /app/rustcompiler
COPY walrus-storage /app/walrus-storage
COPY final.sh /app/final.sh
RUN chmod +x /app/final.sh

# Setup Node.js application (Walrus Storage API)
WORKDIR /app/walrus-storage
RUN pnpm install 
RUN pnpm run build

# Build the Rust application
WORKDIR /app/rustcompiler
RUN cargo build --release

# Final stage - using the same base as the builder for compatibility
FROM rust:latest
WORKDIR /app

# Install only the runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl-dev \
    nodejs \
    npm \
    python3-minimal \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally in final stage
RUN npm install -g pnpm

# Copy only the necessary files from the builder stage
COPY --from=builder /app/rustcompiler/target/release/rustTeeCompiler /app/rustcompiler/target/release/
COPY --from=builder /app/rustcompiler/runner.sh /app/rustcompiler/runner.sh
COPY --from=builder /app/walrus-storage /app/walrus-storage
COPY --from=builder /app/final.sh /app/final.sh
RUN chmod +x /app/final.sh
RUN chmod +x /app/rustcompiler/runner.sh

# Create necessary directories with proper permissions
RUN mkdir -p /app/projects && chmod 777 /app/projects
RUN mkdir -p /app/downloads && chmod 777 /app/downloads
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# Expose ports for both servers
EXPOSE 3001 3002

# Run both services using the 'serve' action
CMD ["/app/final.sh", "serve"] 