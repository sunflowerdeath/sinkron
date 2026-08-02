use async_trait::async_trait;

use crate::error::RequestError;

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
    async fn send(&self, props: SendEmailProps) -> Result<(), RequestError>;
}
