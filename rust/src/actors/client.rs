use std::pin::Pin;

use axum::extract::ws::{Message, WebSocket};
use log::trace;
use tokio::{
    select,
    sync::{mpsc, oneshot},
    time::{sleep, Duration, Instant},
};

use crate::actors::collection;
use crate::actors::collection::{CollectionHandle, CollectionMessage};
use crate::actors::supervisor::{ExitCallback, Supervisor};
use crate::error::SinkronError;
use crate::protocol::*;

// Client actor receives messages from the webscoket connection,
// dispatches them to the Collection and when needed waits for the response
// and replies back.

struct ClientActor {
    supervisor: Supervisor,
    client_id: i32,
    websocket: WebSocket,
    receiver: mpsc::Receiver<ServerMessage>,
    collection: CollectionHandle,
    colrev: i64,
    timeout: Pin<Box<tokio::time::Sleep>>,
}

impl ClientActor {
    async fn run(&mut self) {
        trace!("client-{}: start", self.client_id);

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
                    self.send_ws_message(msg).await;
                },
                _ = &mut self.timeout => {
                    trace!("client-{}: disconnect by timeout", self.client_id);
                }
            }
        }
    }

    fn source(&self) -> collection::Source {
        collection::Source::Client {
            user: "123".to_string(), // TODO actual user id
        }
    }

    async fn sync(&mut self, colrev: i64) -> Result<(), SinkronError> {
        let (sender, receiver) = oneshot::channel();
        self.send_col_message(CollectionMessage::Sync(
            collection::SyncMessage {
                colrev,
                source: self.source(),
                reply: sender,
            },
        ));
        match receiver.await {
            Ok(Ok(res)) => {
                let mut messages: Vec<ServerMessage> = res
                    .documents
                    .into_iter()
                    .map(|doc| {
                        ServerMessage::Doc(DocMessage {
                            id: doc.id,
                            col: doc.col,
                            colrev: doc.colrev,
                            data: doc.data,
                            created_at: doc.created_at,
                            updated_at: doc.updated_at,
                        })
                    })
                    .collect();
                messages.push(ServerMessage::SyncComplete(
                    SyncCompleteMessage {
                        col: self.collection.id.clone(),
                        colrev: res.colrev,
                    },
                ));
                self.send_ws_messages(messages).await;
            }
            _ => {
                let msg = ServerMessage::SyncError(SyncErrorMessage {
                    col: self.collection.id.clone(),
                    code: ErrorCode::InternalServerError,
                });
                self.send_ws_message(msg).await;
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
        // reset disconnect timeout
        self.timeout
            .as_mut()
            .reset(Instant::now() + Duration::from_secs(10));

        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_ws_message(ServerMessage::Heartbeat(reply)).await;
    }

    async fn handle_get(&mut self, msg: GetMessage) {
        let (sender, receiver) = oneshot::channel();
        let send = self.collection.send(CollectionMessage::Get(
            collection::GetMessage {
                id: msg.id,
                source: self.source(),
                reply: sender,
            },
        ));
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
                self.send_ws_message(ServerMessage::Doc(msg)).await;
            }
            Ok(Err(err)) => {
                // Couldn't get document
                let err = GetErrorMessage {
                    id: msg.id,
                    code: err.code,
                };
                self.send_ws_message(ServerMessage::GetError(err)).await;
            }
            Err(_) => {
                // Couldn't receive reply
                // TODO - just exit ?
                let err = GetErrorMessage {
                    id: msg.id,
                    code: ErrorCode::InternalServerError,
                };
                self.send_ws_message(ServerMessage::GetError(err)).await;
            }
        }
    }

    async fn handle_change(&mut self, msg: ClientChangeMessage) {
        let (sender, receiver) = oneshot::channel();

        let col_msg = match (msg.op, msg.data) {
            (Op::Delete, None) => {
                CollectionMessage::Delete(collection::DeleteMessage {
                    id: msg.id,
                    source: self.source(),
                    reply: sender,
                })
            }
            (Op::Update, Some(data)) => {
                CollectionMessage::Update(collection::UpdateMessage {
                    id: msg.id,
                    data,
                    source: self.source(),
                    reply: sender,
                })
            }
            (Op::Create, Some(data)) => {
                CollectionMessage::Create(collection::CreateMessage {
                    id: msg.id,
                    data,
                    source: self.source(),
                    reply: sender,
                })
            }
            _ => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::BadRequest,
                };
                self.send_ws_message(ServerMessage::ChangeError(err)).await;
                return;
            }
        };
        self.send_col_message(col_msg);

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
                self.send_ws_message(ServerMessage::ChangeError(err)).await;
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::InternalServerError,
                };
                self.send_ws_message(ServerMessage::ChangeError(err)).await;
            }
        }
    }

    fn send_col_message(&self, msg: CollectionMessage) {
        let res = self.collection.send(msg);
        if res.is_err() {
            self.supervisor.stop();
            return;
        }
    }

    async fn send_ws_message(&mut self, msg: ServerMessage) {
        if let Ok(encoded) = serde_json::to_string(&msg) {
            let res = self.websocket.send(Message::Text(encoded)).await;
            if res.is_err() {
                self.supervisor.stop();
                return;
            }
            trace!("client-{}: sent message to websocket", self.client_id);
        }
    }

    async fn send_ws_messages(&mut self, messages: Vec<ServerMessage>) {
        for msg in messages {
            self.send_ws_message(msg).await
        }
    }
}

#[derive(Clone)]
pub struct ClientHandle {
    sender: mpsc::Sender<ServerMessage>,
    #[allow(dead_code)]
    pub supervisor: Supervisor,
}

impl ClientHandle {
    pub fn new(
        client_id: i32,
        websocket: WebSocket,
        collection: CollectionHandle,
        colrev: i64,
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
            timeout: Box::pin(tokio::time::sleep(Duration::from_secs(10))),
        };
        supervisor.spawn(async move { reader.run().await }, on_exit);

        Self { supervisor, sender }
    }

    // async fn send_message_raw(&self, msg: Message) {
    // self.client_chan_sender.send(msg).await;
    // }

    pub async fn send_message(&self, msg: ServerMessage) {
        _ = self.sender.send(msg).await;
    }
}
