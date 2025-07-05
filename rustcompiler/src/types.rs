// Error types
#[derive(Debug)]
pub enum CompilerApiError {
    InvalidInput { message: String },
    FileSystemError { message: String },
    ExecutionError { message: String },
    PanicError { message: String },
    InternalError { message: String },
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