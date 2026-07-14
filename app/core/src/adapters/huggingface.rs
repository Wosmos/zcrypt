//! STUB pending port from app/backend/adapters/huggingface.go — do not ship.
use crate::adapters::{AdapterError, PlatformAdapter};
use crate::types::{Chunk, ChunkRef};
use async_trait::async_trait;

pub struct HuggingFace {
    token: String,
    account: String,
}
impl HuggingFace {
    pub fn new(token: &str, account: &str) -> Self {
        Self {
            token: token.into(),
            account: account.into(),
        }
    }
}
#[async_trait]
impl PlatformAdapter for HuggingFace {
    fn platform_name(&self) -> &'static str {
        "huggingface"
    }
    async fn create_repo(&self, _name: &str) -> Result<String, AdapterError> {
        let _ = (&self.token, &self.account);
        todo!("port pending")
    }
    async fn upload(&self, _repo: &str, _chunk: Chunk) -> Result<ChunkRef, AdapterError> {
        todo!("port pending")
    }
    async fn download(&self, _r: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        todo!("port pending")
    }
    async fn delete(&self, _r: &ChunkRef) -> Result<(), AdapterError> {
        todo!("port pending")
    }
    async fn get_repo_size(&self, _repo: &str) -> Result<i64, AdapterError> {
        todo!("port pending")
    }
    async fn list_chunks(&self, _repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        todo!("port pending")
    }
}
