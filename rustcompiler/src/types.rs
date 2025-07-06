// Error types
#[derive(Debug)]
pub enum CompilerApiError {
    InvalidInput { message: String },
    FileSystemError { message: String },
    ExecutionError { message: String },
    PanicError { message: String },
    InternalError { message: String },
    WalrusApiError { message: String },
}

// Response types
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ExecutionResponse {
    pub status: String,
    pub output: String,
    pub quote: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RunRequest {
    pub params: std::collections::HashMap<String, Vec<String>>,
}

// Walrus Storage API types
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WalrusUploadResponse {
    pub success: bool,
    pub blobId: String,
    pub fileName: String,
    pub fileSize: u64,
    pub description: String,
    pub tags: Vec<String>,
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WalrusInfoResponse {
    pub success: bool,
    pub blobId: String,
    pub metadata: WalrusMetadata,
    pub fileSize: u64,
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WalrusMetadata {
    pub description: String,
    pub tags: Vec<String>,
    pub timestamp: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct WalrusErrorResponse {
    pub error: String,
    pub details: Option<String>,
}

// Walrus Storage API client
pub struct WalrusClient {
    base_url: String,
    client: reqwest::Client,
}

impl WalrusClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }

    pub async fn upload_file(
        &self,
        file_bytes: &[u8],
        file_name: &str,
        description: &str,
        tags: &[String],
    ) -> Result<WalrusUploadResponse, String> {
        let form = reqwest::multipart::Form::new()
            .part("tarFile", reqwest::multipart::Part::bytes(file_bytes.to_vec()).file_name(file_name.to_string()))
            .text("description", description.to_string())
            .text("tags", tags.join(","));

        let response = self
            .client
            .post(&format!("{}/upload", self.base_url))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Upload request failed: {}", e))?;

        if response.status().is_success() {
            response
                .json::<WalrusUploadResponse>()
                .await
                .map_err(|e| format!("Failed to parse upload response: {}", e))
        } else {
            let error_response = response
                .json::<WalrusErrorResponse>()
                .await
                .unwrap_or_else(|_| WalrusErrorResponse {
                    error: "Unknown error".to_string(),
                    details: None,
                });
            Err(format!("Upload failed: {}", error_response.error))
        }
    }

    pub async fn retrieve_file(
        &self,
        blob_id: &str,
        output_path: &str,
    ) -> Result<(), String> {
        let response = self
            .client
            .get(&format!("{}/retrieve/{}", self.base_url, blob_id))
            .send()
            .await
            .map_err(|e| format!("Retrieve request failed: {}", e))?;

        if response.status().is_success() {
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Failed to read response bytes: {}", e))?;

            tokio::fs::write(output_path, bytes)
                .await
                .map_err(|e| format!("Failed to write file: {}", e))?;

            Ok(())
        } else {
            let error_response = response
                .json::<WalrusErrorResponse>()
                .await
                .unwrap_or_else(|_| WalrusErrorResponse {
                    error: "Unknown error".to_string(),
                    details: None,
                });
            Err(format!("Retrieve failed: {}", error_response.error))
        }
    }

    pub async fn get_file_info(&self, blob_id: &str) -> Result<WalrusInfoResponse, String> {
        let response = self
            .client
            .get(&format!("{}/info/{}", self.base_url, blob_id))
            .send()
            .await
            .map_err(|e| format!("Info request failed: {}", e))?;

        if response.status().is_success() {
            response
                .json::<WalrusInfoResponse>()
                .await
                .map_err(|e| format!("Failed to parse info response: {}", e))
        } else {
            let error_response = response
                .json::<WalrusErrorResponse>()
                .await
                .unwrap_or_else(|_| WalrusErrorResponse {
                    error: "Unknown error".to_string(),
                    details: None,
                });
            Err(format!("Get info failed: {}", error_response.error))
        }
    }
}