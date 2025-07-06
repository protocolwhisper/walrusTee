use num_bigint::BigUint;
use std::env;

// Prime field arithmetic for Fibonacci
struct PrimeField {
    modulus: BigUint,
}

impl PrimeField {
    fn new(modulus: BigUint) -> Self {
        Self { modulus }
    }
    
    fn add(&self, a: &BigUint, b: &BigUint) -> BigUint {
        (a + b) % &self.modulus
    }
    
    fn mul(&self, a: &BigUint, b: &BigUint) -> BigUint {
        (a * b) % &self.modulus
    }
}

fn fibonacci_prime(n: u64, field: &PrimeField) -> BigUint {
    if n == 0 {
        return BigUint::from(0u32);
    }
    if n == 1 {
        return BigUint::from(1u32);
    }
    
    let mut a = BigUint::from(0u32);
    let mut b = BigUint::from(1u32);
    
    for _ in 2..=n {
        let temp = field.add(&a, &b);
        a = b;
        b = temp;
    }
    
    b
}

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() != 2 {
        println!("Usage: {} <n>", args[0]);
        println!("Calculates Fibonacci(n) under prime field");
        return;
    }
    
    let n: u64 = args[1].parse().expect("Please provide a valid number");
    
    // Use a large prime for the field (2^127 - 1)
    let prime = BigUint::from(2u32).pow(127) - BigUint::from(1u32);
    let field = PrimeField::new(prime);
    
    let result = fibonacci_prime(n, &field);
    println!("{}", result);
} 