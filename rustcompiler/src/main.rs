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
use std::path::Path as StdPath;
use std::sync::Arc;
use chrono;
use lazy_static::lazy_static;


// Global Walrus client
lazy_static::lazy_static! {
    static ref WALRUS_CLIENT: Arc<WalrusClient> = {
        let base_url = env::var("WALRUS_API_URL").unwrap_or_else(|_| "http://localhost:3002".to_string());
        Arc::new(WalrusClient::new(base_url))
    };
}

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
        .route("/run/{user_id}/{project_id}", post(run_project))
        .route("/walrus/upload", post(upload_to_walrus))
        .route("/walrus/retrieve/{blob_id}", get(retrieve_from_walrus))
        .route("/walrus/info/{blob_id}", get(get_walrus_info))
        .layer(cors);
    
    let port = env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    println!("Server started on port {}", port);
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
    
    println!("=== run_project called for user: {}, project: {} ===", user_id, project_id);
    
    let project_dir = format!("./projects/{}/{}", user_id, project_id);
    println!("Project directory: {}", project_dir);
    
    // Create the project directory and src subdirectory
    println!("Creating project directory...");
    fs::create_dir_all(format!("{}/src", project_dir))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create project directory {}: {}", project_dir, e)))?;
    println!("Project directory created successfully");
    
    // Track if we received a tar file
    let mut has_tar_file = false;
    let mut args = Vec::new();
    
    println!("Starting to process multipart upload...");
    // This is commonly used for file upload, reference: https://docs.rs/axum/0.8.1/axum/extract/struct.Multipart.html
    while let Some(field) = multipart.next_field().await.map_err(|e| 
        (StatusCode::BAD_REQUEST, format!("Failed to process uploaded files: {}", e))
    )? {
        let file_name = field.name().ok_or_else(|| 
            (StatusCode::BAD_REQUEST, "Missing field name".to_string())
        )?.to_string();
        
        println!("Processing field: {}", file_name);
        
        if file_name == "tar_file" {
            let file_data = field.bytes().await.map_err(|e| 
                (StatusCode::BAD_REQUEST, format!("Failed to read field data: {}", e))
            )?;
            
            println!("Field data size: {} bytes", file_data.len());
            
            // Save the tar file
            let tar_path = format!("{}/project.tar.gz", project_dir);
            println!("Saving tar file to: {}", tar_path);
            tokio::fs::write(&tar_path, &file_data)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write tar file: {}", e)))?;
            has_tar_file = true;
            println!("Tar file saved successfully");
        } else if file_name == "args" {
            let args_data = field.text().await.map_err(|e| 
                (StatusCode::BAD_REQUEST, format!("Failed to read args data: {}", e))
            )?;
            
            println!("Args received: {}", args_data);
            args = args_data.split_whitespace().map(|s| s.to_string()).collect();
        } else {
            println!("Unknown field: {}", file_name);
            return Err((StatusCode::BAD_REQUEST, format!("Unknown field: {}", file_name)));
        }
    }
    
    if !has_tar_file {
        println!("No tar file received!");
        return Err((StatusCode::BAD_REQUEST, "Missing tar file".to_string()));
    }
    
    println!("About to decompress and run project at: {}", project_dir);
    
    // Decompress the tar file
    let tar_path = format!("{}/project.tar.gz", project_dir);
    println!("Decompressing tar file: {}", tar_path);
    let decompress_result = decompress_tar(&tar_path, &project_dir).await;
    
    match decompress_result {
        Ok(_) => {
            println!("Successfully decompressed tar file");
        },
        Err(e) => {
            println!("Failed to decompress tar file: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to decompress tar file: {}", e)));
        }
    }
    
    // After decompression, ensure proper file structure
    println!("Ensuring project structure...");
    ensure_project_structure(&project_dir).await?;
    println!("Project structure ensured");
    
    // Verify that Cargo.toml and src/main.rs exist after decompression
    let cargo_toml_path = format!("{}/Cargo.toml", project_dir);
    let main_rs_path = format!("{}/src/main.rs", project_dir);
    
    if !StdPath::new(&cargo_toml_path).exists() {
        println!("Missing Cargo.toml file after decompression");
        return Err((StatusCode::BAD_REQUEST, "Missing Cargo.toml file after decompression".to_string()));
    }
    
    if !StdPath::new(&main_rs_path).exists() {
        println!("Missing src/main.rs file after decompression");
        return Err((StatusCode::BAD_REQUEST, "Missing src/main.rs file after decompression".to_string()));
    }
    
    println!("All required files found, preparing to run project");
    
    // Prepare the command to run the project
    let mut command = TokioCommand::new("./runner.sh");
    command.arg("run").arg(&project_dir);
    
    // Add arguments if provided
    for arg in &args {
        command.arg(arg);
    }
    
    command.current_dir("."); // Set working directory to current directory
    
    println!("Executing command: ./runner.sh run {} {} from directory: {:?}", 
             project_dir, 
             args.join(" "), 
             std::env::current_dir().unwrap());
    let output = command.output().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to execute project: {}", e)))?;

    if output.status.success() {
        let binary_output = String::from_utf8_lossy(&output.stdout).to_string();
        println!("Project executed successfully");
        println!("Raw output: {}", binary_output);
        
        // Extract just the result (should be just the number now)
        let result = binary_output.trim().to_string();
        println!("Result: {}", result);
        
        Ok(Response::builder()
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_string(&ExecutionResponse {
                status: "success".to_string(),
                output: result,
                quote: String::new(),
            }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize response: {}", e)))?))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e)))?)
    } else {
        let stderr_output = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        println!("Project execution failed with exit code: {}", exit_code);
        
        if exit_code == 101 || stderr_output.contains("panicked at") {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Panic: {}", stderr_output)))
        } else {
            Err((StatusCode::BAD_REQUEST, format!("Execution error: {}", stderr_output)))
        }
    }
}

async fn decompress_tar(tar_path: &str, extract_dir: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Use tar command to decompress
    let output = TokioCommand::new("tar")
        .arg("-xzf")
        .arg(tar_path)
        .arg("-C")
        .arg(extract_dir)
        .output()
        .await?;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Tar decompression failed: {}", error).into());
    }
    
    Ok(())
}

async fn ensure_project_structure(project_dir: &str) -> Result<(), (StatusCode, String)> {
    // Ensure src directory exists
    let src_dir = format!("{}/src", project_dir);
    fs::create_dir_all(&src_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create src directory: {}", e)))?;
    
    // Move any .rs files from root to src directory
    let entries = fs::read_dir(project_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read project directory: {}", e)))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read directory entry: {}", e)))?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(extension) = path.extension() {
                if extension == "rs" {
                    let filename = path.file_name().unwrap().to_string_lossy();
                    let new_path = format!("{}/src/{}", project_dir, filename);
                    // Clone the path for fs::rename
                    let path_clone = path.clone();
                    if !path_clone.to_string_lossy().contains("/src/") {
                        fs::rename(path_clone, &new_path)
                            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to move {} to src directory: {}", filename, e)))?;
                        println!("Moved {} to src directory", filename);
                    }
                }
            }
        }
    }
   
    Ok(())
}

// Walrus Storage API handlers

pub async fn upload_to_walrus(
    mut multipart: Multipart,
) -> Result<Response<Body>, (StatusCode, String)> {
    println!("=== upload_to_walrus called ===");
    
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name = String::from("uploaded-file.tar.gz");
    let mut description = String::from("Uploaded from Rust Compiler");
    let mut tags = vec!["rust-compiler".to_string(), "upload".to_string()];
    
    while let Some(field) = multipart.next_field().await.map_err(|e| 
        (StatusCode::BAD_REQUEST, format!("Failed to process multipart: {}", e))
    )? {
        let field_name = field.name().ok_or_else(|| 
            (StatusCode::BAD_REQUEST, "Missing field name".to_string())
        )?.to_string();
        
        println!("Processing field: {}", field_name);
        
        match field_name.as_str() {
            "file" => {
                let bytes = field.bytes().await.map_err(|e| 
                    (StatusCode::BAD_REQUEST, format!("Failed to read file data: {}", e))
                )?;
                
                file_bytes = Some(bytes.to_vec());
                println!("File received: {} bytes", bytes.len());
            },
            "fileName" => {
                file_name = field.text().await.map_err(|e| 
                    (StatusCode::BAD_REQUEST, format!("Failed to read filename: {}", e))
                )?;
            },
            "description" => {
                description = field.text().await.map_err(|e| 
                    (StatusCode::BAD_REQUEST, format!("Failed to read description: {}", e))
                )?;
            },
            "tags" => {
                let tags_str = field.text().await.map_err(|e| 
                    (StatusCode::BAD_REQUEST, format!("Failed to read tags: {}", e))
                )?;
                tags = tags_str.split(',').map(|s| s.trim().to_string()).collect();
            },
            _ => {
                println!("Unknown field: {}", field_name);
            }
        }
    }
    
    let file_bytes = file_bytes.ok_or_else(|| 
        (StatusCode::BAD_REQUEST, "No file provided".to_string())
    )?;
    
    println!("Uploading file: {} ({} bytes) to Walrus API on port 3002", file_name, file_bytes.len());
    
    // Use the WalrusClient from types.rs
    match WALRUS_CLIENT.upload_file(&file_bytes, &file_name, &description, &tags).await {
        Ok(response) => {
            println!("Upload successful! Blob ID: {}", response.blobId);
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&response)
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize response: {}", e)))?))
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e)))?)
        },
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Upload failed: {}", e)))
        }
    }
}

pub async fn retrieve_from_walrus(
    Path(blob_id): Path<String>,
) -> Result<Response<Body>, (StatusCode, String)> {
    println!("=== retrieve_from_walrus called for blob: {} ===", blob_id);
    
    let output_path = format!("downloads/retrieved_{}.tar.gz", blob_id);
    
    // Ensure downloads directory exists
    tokio::fs::create_dir_all("downloads")
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create downloads directory: {}", e)))?;
    
    println!("Retrieving file from Walrus API on port 3002 for blob: {}", blob_id);
    
    // Use the WalrusClient from types.rs
    match WALRUS_CLIENT.retrieve_file(&blob_id, &output_path).await {
        Ok(_) => {
            // Read the file and send it as response
            let file_data = tokio::fs::read(&output_path)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read retrieved file: {}", e)))?;
            
            // Clean up the file
            let _ = tokio::fs::remove_file(&output_path).await;
            
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "application/gzip")
                .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"retrieved_{}.tar.gz\"", blob_id))
                .body(Body::from(file_data))
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e)))?)
        },
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Retrieve failed: {}", e)))
        }
    }
}

pub async fn get_walrus_info(
    Path(blob_id): Path<String>,
) -> Result<Response<Body>, (StatusCode, String)> {
    println!("=== get_walrus_info called for blob: {} ===", blob_id);
    
    println!("Getting file info from Walrus API on port 3002 for blob: {}", blob_id);
    
    // Use the WalrusClient from types.rs
    match WALRUS_CLIENT.get_file_info(&blob_id).await {
        Ok(response) => {
            Ok(Response::builder()
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&response)
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to serialize response: {}", e)))?))
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build response: {}", e)))?)
        },
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Get info failed: {}", e)))
        }
    }
} 