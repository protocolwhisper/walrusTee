mod types;

use axum::{
    extract::Path,
    body::Body,
    response::Response,
    http::header,
    extract::Multipart,
    routing::{post, get},
    Router,
    http::StatusCode,
};
use tokio::process::Command as TokioCommand;
use serde_json;
use std::fs;
use std::env;
use tokio::net::TcpListener;
use tower_http::cors::{CorsLayer, Any};
use dotenv::dotenv;
use crate::types::*;

#[tokio::main]
async fn main() {
    dotenv().ok();
    
    let allowed_origins_str = env::var("CORS_ALLOWED_ORIGIN")
        .unwrap_or_else(|_| "*".to_string());
    
    // Create CORS middleware
    let cors = create_cors_layer(&allowed_origins_str);
    
    let app = Router::new()
        .route("/health", get(|| async {
            println!("Rust Tee Compiler from Cannes");
            "Rust Compiler API is running"
        }))
        .route("/run/:user_id/:project_id", post(run_project))
        .layer(cors);
    
    let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server started on port 3000");
    axum::serve(listener, app).await.unwrap();
}

fn create_cors_layer(allowed_origins: &str) -> CorsLayer {
    if allowed_origins == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<_> = allowed_origins
            .split(',')
            .map(|s| s.trim().parse().unwrap())
            .collect();
        
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    }
}

pub async fn run_project(
    Path((user_id, project_id)): Path<(String, String)>,
    mut multipart: Multipart,
) -> Result<Response<Body>, (StatusCode, String)> {
    
    let project_dir = format!("/app/projects/{}/{}", user_id, project_id);
    
    // Create the project directory and src subdirectory
    fs::create_dir_all(format!("{}/src", project_dir))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create project directory {}: {}", project_dir, e)))?;
    
    // Track required files
    let mut has_cargo_toml = false;
    let mut has_main_rs = false;
    
    // This is commonly used for file upload, reference: https://docs.rs/axum/0.8.1/axum/extract/struct.Multipart.html
    while let Some(field) = multipart.next_field().await.map_err(|e| 
        (StatusCode::BAD_REQUEST, format!("Failed to process uploaded files: {}", e))
    )? {
        let file_name = field.name().ok_or_else(|| 
            (StatusCode::BAD_REQUEST, "Missing field name".to_string())
        )?.to_string();
        
        let file_data = field.bytes().await.map_err(|e| 
            (StatusCode::BAD_REQUEST, format!("Failed to read field data: {}", e))
        )?;
        
        match file_name.as_str() { 
            "cargo_toml" => {
                tokio::fs::write(format!("{}/Cargo.toml", project_dir), &file_data)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write Cargo.toml: {}", e)))?;
                has_cargo_toml = true;
            },
            "main_rs" => {
                tokio::fs::write(format!("{}/src/main.rs", project_dir), &file_data)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write main.rs: {}", e)))?;
                has_main_rs = true;
            },
            "env_file" => {
                tokio::fs::write(format!("{}/project.env", project_dir), &file_data)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write environment file: {}", e)))?;
            },
            _ => {
                // Handle multiple files
                if file_name.ends_with(".rs") {
                    let filename = file_name.split('/').last().unwrap_or(&file_name);
                    tokio::fs::write(format!("{}/src/{}", project_dir, filename), &file_data)
                        .await
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write {}: {}", filename, e)))?;
                } else {
                    let file_name = file_name.split('/').last().unwrap_or(&file_name);
                    tokio::fs::write(format!("{}/src/{}", project_dir, file_name), &file_data)
                        .await
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write {}: {}", file_name, e)))?;
                }
            }
        }
    }
    
    if !has_cargo_toml {
        return Err((StatusCode::BAD_REQUEST, "Missing Cargo.toml file".to_string()));
    }
    
    if !has_main_rs {
        return Err((StatusCode::BAD_REQUEST, "Missing src/main.rs file".to_string()));
    }
    
    println!("About to run project at: {}", project_dir);
    
    // Prepare the command
    let mut command = TokioCommand::new("/app/runner.sh");
    command.arg("run").arg(&project_dir);
    
    let output = command.output().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to execute project: {}", e)))?;
    
    if output.status.success() {
        let binary_output = String::from_utf8_lossy(&output.stdout).to_string();
        
        Ok(Response::builder()
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_string(&ExecutionResponse {
                status: "success".to_string(),
                output: binary_output,
                quote: String::new(),
            }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize response: {}", e)))?))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e)))?)
    } else {
        let stderr_output = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        
        if exit_code == 101 || stderr_output.contains("panicked at") {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Panic: {}", stderr_output)))
        } else {
            Err((StatusCode::BAD_REQUEST, format!("Execution error: {}", stderr_output)))
        }
    }
} 