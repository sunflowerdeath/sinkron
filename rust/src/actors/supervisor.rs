use std::sync::Arc;
use tokio::{select, sync::Notify};

#[derive(Clone)]
pub struct Supervisor {
    pub stop: Arc<Notify>,
    pub exit: Arc<Notify>,
}

pub type ExitCallback = Box<dyn FnOnce() + Send>;

impl Supervisor {
    pub fn new() -> Self {
        Self {
            stop: Arc::new(Notify::new()),
            exit: Arc::new(Notify::new()),
        }
    }

    pub fn spawn<T>(&self, task: T, on_exit: Option<ExitCallback>)
    where
        T: std::future::Future + Send + 'static,
    {
        let stop = self.stop.clone();
        let exit = self.exit.clone();
        tokio::spawn(async move {
            select! {
                _ = stop.notified() => {},
                _ = task => {},
            }
            exit.notify_waiters();
            if let Some(on_exit) = on_exit {
                on_exit();
            }
        });
    }

    pub fn stop(&self) {
        self.stop.notify_waiters();
    }
}
