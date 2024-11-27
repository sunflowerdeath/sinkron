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

// Period after which the client is considered inactive and will be disconnected
// (Client should send heartbeat messages every 30 seconds)
const DISCONNECT_TIMEOUT: Duration = Duration::from_secs(60);

// Client actor receives messages from the webscoket connection,
// dispatches them to the Collection and when needed waits for the response
// and replies back.

#[allow(dead_code)]
pub enum ClientActorMessage {
    Sinkron(ServerMessage),
    Raw(String),
}

struct ClientActor {
    supervisor: Supervisor,
    client_id: i32,
    user_id: String,
    websocket: WebSocket,
    receiver: mpsc::UnboundedReceiver<ClientActorMessage>,
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
                _ = &mut self.timeout => {
                    trace!("client-{}: disconnect by timeout", self.client_id);
                    break
                },
                Some(msg) = self.receiver.recv() => {
                    match msg {
                        ClientActorMessage::Sinkron(msg) => {
                            self.send_to_ws(msg).await;
                        },
                        ClientActorMessage::Raw(msg) => {
                            self.send_to_ws_raw(msg).await;
                        }
                    };
                },
                msg = self.websocket.recv() => {
                    match msg {
                        Some(Ok(msg)) => self.handle_message(msg).await,
                        _ => break
                    }
                },
            }
        }
    }

    fn source(&self) -> collection::Source {
        collection::Source::Client {
            user: self.user_id.clone(),
        }
    }

    async fn sync(&mut self, colrev: i64) -> Result<(), SinkronError> {
        let (sender, receiver) = oneshot::channel();
        self.send_to_col(CollectionMessage::Sync(collection::SyncMessage {
            colrev,
            source: self.source(),
            reply: sender,
        }));
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
                self.send_to_ws_many(messages).await;
            }
            Ok(Err(err)) => {
                let msg = ServerMessage::SyncError(SyncErrorMessage {
                    col: self.collection.id.clone(),
                    code: err.code,
                });
                self.send_to_ws(msg).await;
            }
            _ => {
                let msg = ServerMessage::SyncError(SyncErrorMessage {
                    col: self.collection.id.clone(),
                    code: ErrorCode::InternalServerError,
                });
                self.send_to_ws(msg).await;
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
            .reset(Instant::now() + DISCONNECT_TIMEOUT);

        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_to_ws(ServerMessage::Heartbeat(reply)).await;
    }

    async fn handle_get(&mut self, msg: GetMessage) {
        let (sender, receiver) = oneshot::channel();
        let get_msg = CollectionMessage::Get(collection::GetMessage {
            id: msg.id,
            source: self.source(),
            reply: sender,
        });
        self.send_to_col(get_msg);
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
                self.send_to_ws(ServerMessage::Doc(msg)).await;
            }
            Ok(Err(err)) => {
                // Couldn't get document
                let err = GetErrorMessage {
                    id: msg.id,
                    code: err.code,
                };
                self.send_to_ws(ServerMessage::GetError(err)).await;
            }
            Err(_) => {
                let err = GetErrorMessage {
                    id: msg.id,
                    code: ErrorCode::InternalServerError,
                };
                self.send_to_ws(ServerMessage::GetError(err)).await;
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
                    changeid: msg.changeid,
                    reply: sender,
                })
            }
            (Op::Update, Some(data)) => {
                CollectionMessage::Update(collection::UpdateMessage {
                    id: msg.id,
                    data,
                    source: self.source(),
                    changeid: msg.changeid,
                    reply: sender,
                })
            }
            (Op::Create, Some(data)) => {
                CollectionMessage::Create(collection::CreateMessage {
                    id: msg.id,
                    data,
                    source: self.source(),
                    changeid: msg.changeid,
                    reply: sender,
                })
            }
            _ => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::BadRequest,
                };
                self.send_to_ws(ServerMessage::ChangeError(err)).await;
                return;
            }
        };
        self.send_to_col(col_msg);

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
                self.send_to_ws(ServerMessage::ChangeError(err)).await;
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::InternalServerError,
                };
                self.send_to_ws(ServerMessage::ChangeError(err)).await;
            }
        }
    }

    fn send_to_col(&self, msg: CollectionMessage) {
        let res = self.collection.send(msg);
        if res.is_err() {
            self.supervisor.stop();
        }
    }

    async fn send_to_ws(&mut self, msg: ServerMessage) {
        if let Ok(encoded) = serde_json::to_string(&msg) {
            let res = self.websocket.send(Message::Text(encoded)).await;
            if res.is_err() {
                self.supervisor.stop();
                return;
            }
            trace!("client-{}: sent message to websocket", self.client_id);
        }
    }

    async fn send_to_ws_many(&mut self, messages: Vec<ServerMessage>) {
        for msg in messages {
            self.send_to_ws(msg).await
        }
    }

    async fn send_to_ws_raw(&mut self, msg: String) {
        let res = self.websocket.send(Message::Text(msg)).await;
        if res.is_err() {
            self.supervisor.stop();
            return;
        }
        trace!("client-{}: sent message to websocket", self.client_id);
    }
}

#[derive(Clone)]
pub struct ClientHandle {
    sender: mpsc::UnboundedSender<ClientActorMessage>,
    #[allow(dead_code)]
    pub supervisor: Supervisor,
}

impl ClientHandle {
    pub fn new(
        client_id: i32,
        user_id: String,
        websocket: WebSocket,
        collection: CollectionHandle,
        colrev: i64,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new();
        let mut reader = ClientActor {
            supervisor: supervisor.clone(),
            colrev,
            client_id,
            user_id,
            collection,
            websocket,
            receiver,
            timeout: Box::pin(sleep(DISCONNECT_TIMEOUT)),
        };
        supervisor.spawn(async move { reader.run().await }, on_exit);
        Self { supervisor, sender }
    }

    pub fn send(&self, msg: ClientActorMessage) {
        _ = self.sender.send(msg);
    }
}
