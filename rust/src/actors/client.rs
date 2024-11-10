use axum::extract::ws::{Message, WebSocket};
use log::trace;
use tokio::{
    select,
    sync::{mpsc, oneshot},
    time::{sleep, Duration},
};

use crate::error::SinkronError;
use crate::protocol::*;
use crate::supervisor::{Supervisor, ExitCallback};
use crate::actors::collection::{CollectionMessage, CollectionHandle};

// Client actor receives messages from the webscoket connection,
// dispatches them to the Collection and when needed waits for the response
// and replies back.

struct ClientActor {
    supervisor: Supervisor,
    client_id: i32,
    websocket: WebSocket,
    receiver: mpsc::Receiver<ServerMessage>,
    collection: CollectionHandle,
    colrev: Option<i64>,
    timeout_task: Option<tokio::task::JoinHandle<()>>,
}

impl ClientActor {
    async fn run(&mut self) {
        trace!("client-{}: start", self.client_id);

        self.restart_disconnect_timer();

        if self.sync(self.colrev).await.is_err() {
            trace!("client-{}: sync failed", self.client_id);
            return;
        } else {
            trace!("client-{}: sync completed", self.client_id);
        }

        loop {
            select! {
                msg = self.websocket.recv() => {
                    match msg {
                        Some(Ok(msg)) => self.handle_message(msg).await,
                        _ => break
                    }
                },
                Some(msg) = self.receiver.recv() => {
                    self.send_message(msg).await;
                }
            }
        }
    }

    fn restart_disconnect_timer(&mut self) {
        let client_id = self.client_id.clone();
        let stop = self.supervisor.stop.clone();
        self.timeout_task = Some(tokio::spawn(async move {
            sleep(Duration::from_secs(5)).await;
            trace!("client-{}: disconnect by timeout", client_id);
            stop.notify_waiters();
        }));
    }

    async fn sync(&mut self, colrev: Option<i64>) -> Result<(), SinkronError> {
        let (sender, receiver) = oneshot::channel();
        let msg = CollectionMessage::Sync {
            colrev,
            reply: sender,
        };
        self.collection.send(msg);
        match receiver.await {
            Ok(Ok(res)) => {
                let msg = ServerMessage::SyncComplete(SyncCompleteMessage {
                    col: self.collection.id.clone(),
                    colrev: "todo".to_string(),
                });
                self.send_message(msg).await;
                // send documents & sync_complete to client
            }
            _ => {
                let msg = ServerMessage::SyncError(SyncErrorMessage {
                    col: self.collection.id.clone(),
                    code: ErrorCode::InternalServerError,
                });
                self.send_message(msg).await;
                // send sync error to client
            }
        };
        Ok(())
    }

    async fn handle_message(&mut self, msg: Message) {
        let Message::Text(str) = msg else {
            // unsupported message type
            return;
        };
        let Ok(deserialized) = serde_json::from_str::<ClientMessage>(&str)
        else {
            // deserialize error
            return;
        };
        match deserialized {
            ClientMessage::Heartbeat(msg) => self.handle_heartbeat(msg).await,
            ClientMessage::Get(msg) => self.handle_get(msg).await,
            ClientMessage::Change(msg) => self.handle_change(msg).await,
        };
    }

    async fn handle_heartbeat(&mut self, msg: HeartbeatMessage) {
        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.restart_disconnect_timer();
        self.send_message(ServerMessage::Heartbeat(reply)).await;
    }

    async fn handle_get(&mut self, msg: GetMessage) {
        let (sender, receiver) = oneshot::channel();
        let send = self.collection.send(CollectionMessage::Get {
            id: msg.id,
            reply: sender,
        });
        if send.is_err() {
            // TODO couldn't send, just exit ?
            return;
        }
        match receiver.await {
            Ok(Ok(doc)) => {
                let msg = DocMessage {
                    id: doc.id,
                    col: doc.col,
                    colrev: doc.colrev,
                    data: doc.data,
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                };
                self.send_message(ServerMessage::Doc(msg)).await;
            }
            Ok(Err(err)) => {
                // Couldn't get document
                let err = GetErrorMessage {
                    id: msg.id,
                    code: err.code,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
            Err(_) => {
                // Couldn't receive reply
                // TODO - just exit ?
                let err = GetErrorMessage {
                    id: msg.id,
                    code: ErrorCode::InternalServerError,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
        }
    }

    async fn handle_change(&mut self, msg: ClientChangeMessage) {
        let (sender, receiver) = oneshot::channel();

        let col_msg = match (msg.op, msg.data) {
            (Op::Delete, None) => CollectionMessage::Delete {
                id: msg.id,
                reply: sender,
            },
            (Op::Update, Some(data)) => CollectionMessage::Update {
                id: msg.id,
                reply: sender,
                data,
            },
            (Op::Create, Some(data)) => CollectionMessage::Create {
                id: msg.id,
                reply: sender,
                data,
            },
            _ => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::BadRequest,
                };
                self.send_message(ServerMessage::ChangeError(err)).await;
                return;
            }
        };

        self.collection.send(col_msg);
        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(err)) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: err.code,
                };
                self.send_message(ServerMessage::ChangeError(err)).await;
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::InternalServerError,
                };
                self.send_message(ServerMessage::ChangeError(err)).await;
            }
        }
    }

    async fn send_message(&mut self, msg: ServerMessage) {
        if let Ok(encoded) = serde_json::to_string(&msg) {
            let _ = self.websocket.send(Message::Text(encoded)).await;
            trace!("client-{}: sent message to websocket", self.client_id);
        }
        // TODO if couldnt write, then writer actor is dead, so exit
    }
}

#[derive(Clone)]
pub struct ClientHandle {
    sender: mpsc::Sender<ServerMessage>,
    supervisor: Supervisor,
}

impl ClientHandle {
    pub fn new(
        client_id: i32,
        websocket: WebSocket,
        collection: CollectionHandle,
        colrev: Option<i64>,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(8);
        let supervisor = Supervisor::new();
        let mut reader = ClientActor {
            supervisor: supervisor.clone(),
            colrev,
            client_id,
            collection,
            websocket,
            receiver,
            timeout_task: None,
        };
        supervisor.spawn(async move { reader.run().await }, on_exit);

        Self { supervisor, sender }
    }

    // async fn send_message_raw(&self, msg: Message) {
    // self.client_chan_sender.send(msg).await;
    // }

    pub async fn send_message(&self, msg: ServerMessage) {
        self.sender.send(msg).await;
    }
}
