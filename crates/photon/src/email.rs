use async_trait::async_trait;
use serde::Serialize;

use crate::error::RequestError;

#[derive(Serialize)]
pub struct SendEmailProps {
    pub from: Option<String>,
    pub sender: String,
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

#[async_trait]
pub trait EmailSender {
    async fn send(&self, email: SendEmailProps) -> Result<(), RequestError>;
}

pub struct FakeEmailSender {}

#[async_trait]
impl EmailSender for FakeEmailSender {
    async fn send(&self, email: SendEmailProps) -> Result<(), RequestError> {
        let serialized = serde_json::to_string(&email).unwrap();
        println!("Email sent:\n{}", serialized);
        Ok(())
    }
}
