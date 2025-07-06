# Fibonacci Prime Field Calculator

A simple Rust project that calculates Fibonacci numbers under a prime field.

## Usage

```bash
# Build the project
cargo build --release

# Run with a number
cargo run --release 10
```

## Features

- Calculates Fibonacci(n) under prime field 2^127 - 1
- Uses efficient modular arithmetic
- Handles large numbers with BigUint

## Example

```bash
$ cargo run --release 10
Calculating Fibonacci(10) under prime field 2^127 - 1
Result: 55
``` 