use std::sync::Arc;

use tokio::select;
use tokio::sync::Notify;
// use tokio::task::Builder;

#[derive(Clone)]
pub struct Supervisor {
    pub stop: Arc<Notify>,
}

pub type ExitCallback = Box<dyn FnOnce() + Send>;

impl Supervisor {
    pub fn new() -> Self {
        Self {
            stop: Arc::new(Notify::new()),
        }
    }

    pub fn spawn<T>(
        &self,
        _name: String,
        task: T,
        on_exit: Option<ExitCallback>,
    ) where
        T: std::future::Future + Send + 'static,
    {
        let stop = self.stop.clone();
        // Builder::new().name(&name).spawn(async move {
        tokio::task::spawn(async move {
            select! {
                _ = task => {},
                () = stop.notified() => {},
            }
            if let Some(on_exit) = on_exit {
                on_exit();
            }
        });
    }

    pub fn stop(&self) {
        self.stop.notify_waiters();
    }
}
