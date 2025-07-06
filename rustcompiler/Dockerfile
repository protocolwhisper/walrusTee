# Use the official Rust image
FROM rust:1.75-slim

# Install necessary packages
RUN apt-get update && apt-get install -y \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1000 app

# Set working directory
WORKDIR /app

# Switch to app user
USER app

# Expose port
EXPOSE 3000

# Set environment variables
ENV RUST_LOG=info
ENV CORS_ALLOWED_ORIGIN=*

# For development: run cargo run
# For production: copy binary and run it
CMD ["cargo", "run", "--release"] 