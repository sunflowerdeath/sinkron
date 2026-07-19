use std::pin::Pin;

use axum::extract::ws::{Message, WebSocket};
use log::{debug, trace};
use tokio::{
    select,
    sync::{mpsc, oneshot},
    time::{Duration, Instant, sleep},
};

use sinkron_common::error::SinkronError;
use sinkron_common::protocol::*;

use crate::actors::collection;
use crate::actors::collection::{CollectionHandle, CollectionMessage};
use crate::actors::sinkron::SinkronHandle;

fn parse_channel_prefix(input: &str) -> Option<(i32, &str)> {
    // String must start with a number, followed by ":" symbol
    let mut len = 0;
    for c in input.chars() {
        if char::is_numeric(c) {
            len += 1;
        } else {
            break;
        }
    }
    if len == 0 {
        return None;
    }
    if input.chars().nth(len) != Some(':') {
        return None;
    }
    let Ok(prefix) = str::parse::<i32>(&input[0..len]) else {
        return None;
    };
    return Some((prefix, &input[len + 1..]));
}

fn serialize_with_channel_prefix(
    channel: i32,
    msg: &ServerMessage,
) -> Option<String> {
    let mut res = channel.to_string() + ":";
    match serde_json::to_writer(unsafe { res.as_mut_vec() }, &msg) {
        Ok(_) => Some(res),
        Err(_) => None,
    }
}

fn serialize_raw_with_channel_prefix(channel: i32, msg: &str) -> String {
    channel.to_string() + ":" + msg
}

// Client should send heartbeat messages every 30 seconds, if it fails to
// send it it will be disconnected
const HEARTBEAT_DISCONNECT_TIMEOUT: Duration = Duration::from_secs(60);

// Period after which the client is considered inactive and will be disconnected
const IDLE_DISCONNECT_TIMEOUT: Duration = Duration::from_secs(60);

pub enum ClientActorMessage {
    // Sends message to the client through Websocket
    Send {
        message: ServerMessage,
        channel: i32,
    },
    // Sends raw message to the client through Websocket
    SendRaw {
        message: String,
        channel: i32,
    },
    // Requests graceful stop
    Stop,
}

#[derive(Clone)]
pub struct ClientChannelSender {
    channel_id: i32,
    client_handle: ClientHandle,
}

impl ClientChannelSender {
    pub fn send(&self, message: ServerMessage) {
        self.client_handle.send(ClientActorMessage::Send {
            channel: self.channel_id,
            message,
        });
    }

    pub fn send_raw(&self, message: String) {
        self.client_handle.send(ClientActorMessage::SendRaw {
            channel: self.channel_id,
            message,
        });
    }
}

struct SyncState {
    col: String,
    col_handle: CollectionHandle,
    subscriber_id: i32,
}

struct ClientChannel {
    user_id: String,
    is_closed: bool,
    sinkron_handle: SinkronHandle,
    sender: ClientChannelSender,
    sync_state: Option<SyncState>,
}

impl ClientChannel {
    async fn handle_message(&mut self, msg: ClientMessage) {
        if self.is_closed {
            // Invalid: channel is closed
            return;
        }

        match msg {
            ClientMessage::Heartbeat(_) => {
                // Invalid message: wrong channel
                return;
            }
            ClientMessage::SyncStart(msg) => self.handle_sync_start(msg).await,
            ClientMessage::SyncStop(_) => self.handle_sync_stop().await,
            ClientMessage::Get(msg) => self.handle_get(msg).await,
            ClientMessage::Create(msg) => self.handle_create(msg).await,
            ClientMessage::Update(msg) => self.handle_update(msg).await,
            ClientMessage::Delete(msg) => self.handle_delete(msg).await,
        };
    }

    async fn handle_sync_start(&mut self, msg: SyncStartMessage) {
        if self.sync_state.is_some() {
            // Invalid message: collection is already synchronized
            return;
        };

        let SyncStartMessage { col, colrev } = msg;

        let Ok(col_handle) =
            self.sinkron_handle.get_collection_actor(col.clone()).await
        else {
            let msg = ServerMessage::SyncError(SyncErrorMessage {
                col,
                error: SinkronError::not_found("Collection not found").into(),
            });
            self.sender.send(msg);
            self.close();
            return;
        };

        let (sender, receiver) = oneshot::channel();
        let _ =
            col_handle.send(CollectionMessage::Sync(collection::SyncMessage {
                colrev,
                source: self.source(),
                reply: sender,
                updates: self.sender.clone(),
            }));

        match receiver.await {
            Ok(Ok(res)) => {
                for doc in res.documents {
                    let msg = match doc.content {
                        Some(content) => ServerMessage::Doc(DocMessage {
                            id: doc.id,
                            col: doc.col,
                            colrev: doc.colrev,
                            content,
                            files: Vec::new(), // TODO
                            created_at: doc.created_at,
                            updated_at: doc.updated_at,
                        }),
                        None => ServerMessage::Delete(ServerDeleteMessage {
                            id: doc.id,
                            col: doc.col,
                            colrev: doc.colrev,
                        }),
                    };
                    self.sender.send(msg);
                }
                self.sender.send(ServerMessage::SyncComplete(
                    SyncCompleteMessage {
                        col: col.clone(),
                        colrev: res.colrev,
                    },
                ));
                self.sync_state = Some(SyncState {
                    col,
                    col_handle,
                    subscriber_id: res.subscriber_id,
                });
            }
            Ok(Err(error)) => {
                let msg =
                    ServerMessage::SyncError(SyncErrorMessage { col, error });
                self.sender.send(msg);
                self.close();
            }
            _ => {
                let msg = ServerMessage::SyncError(SyncErrorMessage {
                    col,
                    error: SinkronError::internal("Internal server error")
                        .into(),
                });
                self.sender.send(msg);
                self.close();
            }
        };
    }

    async fn handle_sync_stop(&mut self) {
        self.close();
    }

    fn source(&self) -> collection::Source {
        collection::Source::Client {
            user: self.user_id.clone(),
        }
    }

    async fn handle_get(&mut self, msg: GetMessage) {
        let Some(sync_state) = &self.sync_state else {
            // Invalid message: collection is not synchronized
            return;
        };

        let (sender, receiver) = oneshot::channel();
        let get_msg = CollectionMessage::Get(collection::GetMessage {
            id: msg.id,
            source: self.source(),
            reply: sender,
        });
        let _ = sync_state.col_handle.send(get_msg);
        match receiver.await {
            Ok(Ok(doc)) => {
                let msg = DocMessage {
                    id: doc.id,
                    col: doc.col,
                    colrev: doc.colrev,
                    content: doc.content.unwrap_or("".to_string()),
                    files: Vec::new(), // TODO
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                };
                self.sender.send(ServerMessage::Doc(msg));
            }
            Ok(Err(error)) => {
                // Couldn't get document
                let err = GetErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error,
                };
                self.sender.send(ServerMessage::GetError(err));
            }
            Err(_) => {
                let err = GetErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error: SinkronError::internal("Internal server error"),
                };
                self.sender.send(ServerMessage::GetError(err));
            }
        }
    }

    async fn handle_create(&mut self, msg: ClientCreateMessage) {
        let Some(sync_state) = &self.sync_state else {
            // Invalid message: collection is not synchronized
            return;
        };

        let (sender, receiver) = oneshot::channel();
        let col_msg = CollectionMessage::Create(collection::CreateMessage {
            id: msg.id,
            content: msg.content,
            files: msg.files,
            source: self.source(),
            reply: sender,
        });
        let _ = sync_state.col_handle.send(col_msg);

        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(error)) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error,
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error: SinkronError::internal("Internal server error")
                        .into(),
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
        }
    }

    async fn handle_update(&mut self, msg: ClientUpdateMessage) {
        let Some(sync_state) = &self.sync_state else {
            // Invalid message: collection is not synchronized
            return;
        };

        let (sender, receiver) = oneshot::channel();
        let col_msg = CollectionMessage::Update(collection::UpdateMessage {
            id: msg.id,
            content_update: msg.content_update,
            files_update: msg.files_update,
            source: self.source(),
            reply: sender,
        });
        let _ = sync_state.col_handle.send(col_msg);

        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(error)) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error,
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error: SinkronError::internal("Internal server error")
                        .into(),
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
        }
    }

    async fn handle_delete(&mut self, msg: ClientDeleteMessage) {
        let Some(sync_state) = &self.sync_state else {
            // Invalid message: collection is not synchronized
            return;
        };

        let (sender, receiver) = oneshot::channel();
        let col_msg = CollectionMessage::Delete(collection::DeleteMessage {
            id: msg.id,
            source: self.source(),
            reply: sender,
        });
        // TODO should handle send errors (in all places) ?
        let _ = sync_state.col_handle.send(col_msg).is_err();

        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(error)) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error,
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    col: sync_state.col.clone(),
                    id: msg.id,
                    error: SinkronError::internal("Internal server error")
                        .into(),
                };
                self.sender.send(ServerMessage::ChangeError(err));
            }
        }
    }

    pub fn close(&mut self) {
        if self.is_closed {
            return;
        }
        if let Some(state) = &self.sync_state {
            let _ = state.col_handle.send(CollectionMessage::SyncStop(
                collection::SyncStopMessage {
                    subscriber_id: state.subscriber_id,
                },
            ));
        };
        self.is_closed = true;
    }
}

struct ClientActor {
    user_id: String,
    client_id: i32,
    websocket: WebSocket,
    receiver: mpsc::UnboundedReceiver<ClientActorMessage>,
    sinkron_handle: SinkronHandle,
    self_handle: ClientHandle,
    heartbeat_timeout: Pin<Box<tokio::time::Sleep>>,
    idle_timeout: Pin<Box<tokio::time::Sleep>>,
    channels: std::collections::HashMap<i32, ClientChannel>,
}

impl ClientActor {
    fn new(
        user_id: String,
        client_id: i32,
        websocket: WebSocket,
        sinkron_handle: SinkronHandle,
        receiver: mpsc::UnboundedReceiver<ClientActorMessage>,
        self_handle: ClientHandle,
    ) -> Self {
        ClientActor {
            user_id,
            client_id,
            websocket,
            receiver,
            sinkron_handle,
            self_handle,
            heartbeat_timeout: Box::pin(sleep(HEARTBEAT_DISCONNECT_TIMEOUT)),
            idle_timeout: Box::pin(sleep(IDLE_DISCONNECT_TIMEOUT)),
            channels: std::collections::HashMap::new(),
        }
    }

    async fn run(&mut self) {
        debug!("client-{}: start", self.client_id);

        loop {
            select! {
                biased;
                () = &mut self.heartbeat_timeout => {
                    debug!("client-{}: disconnect (heartbeat)", self.client_id);
                    break
                },
                () = &mut self.idle_timeout => {
                    debug!("client-{}: disconnect (idle)", self.client_id);
                    break
                },
                Some(msg) = self.receiver.recv() => {
                    match msg {
                        ClientActorMessage::Send{ channel, message } => {
                            let sent = self.send_to_ws(channel, message).await;
                            if sent == false {
                                break
                            }
                        },
                        ClientActorMessage::SendRaw{ channel, message } => {
                            let sent = self.send_to_ws_raw(channel, message).await;
                            if sent == false {
                                break
                            }
                        },
                        ClientActorMessage::Stop => {
                            break
                        }
                    };
                },
                msg = self.websocket.recv() => {
                    match msg {
                        Some(Ok(msg)) => self.handle_message(msg).await,
                        _ => break // Websocket disconnected
                    }
                },
            }
        }

        for chan in self.channels.values_mut() {
            chan.close();
        }

        debug!("client-{}: exit", self.client_id);
    }

    async fn handle_message(&mut self, msg: Message) {
        let Message::Text(str) = msg else {
            // Invalid message: unsupported message type
            return;
        };
        let Some((channel_id, body)) = parse_channel_prefix(&str) else {
            // Invalid message: couldn't parse channel prefix
            return;
        };
        let Ok(deserialized) = serde_json::from_str::<ClientMessage>(&body)
        else {
            // Invalid message: deserialize error
            return;
        };

        if channel_id == 0 {
            if let ClientMessage::Heartbeat(msg) = deserialized {
                self.handle_heartbeat(msg).await;
            } else {
                // Invalid message: wrong channel
            }
        } else {
            let chan = self.channels.entry(channel_id).or_insert_with(|| {
                ClientChannel {
                    is_closed: false,
                    sync_state: None,
                    user_id: self.user_id.clone(),
                    sender: ClientChannelSender {
                        channel_id,
                        client_handle: self.self_handle.clone(),
                    },
                    sinkron_handle: self.sinkron_handle.clone(),
                }
            });
            chan.handle_message(deserialized).await;
        }
    }

    async fn handle_heartbeat(&mut self, msg: HeartbeatMessage) {
        // reset disconnect timeout
        self.heartbeat_timeout
            .as_mut()
            .reset(Instant::now() + HEARTBEAT_DISCONNECT_TIMEOUT);
        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_to_ws(0, ServerMessage::Heartbeat(reply)).await;
    }

    async fn send_to_ws(&mut self, channel: i32, msg: ServerMessage) -> bool {
        let Some(serialized) = serialize_with_channel_prefix(channel, &msg)
        else {
            // Couldn't serialize message
            return false;
        };
        let res = self.websocket.send(Message::Text(serialized.into())).await;
        if res.is_err() {
            return false;
        }
        trace!(
            "client-{}/channel-{}: sent message to websocket",
            self.client_id, channel
        );
        true
    }

    async fn send_to_ws_many(
        &mut self,
        channel: i32,
        messages: Vec<ServerMessage>,
    ) -> bool {
        for msg in messages {
            let sent = self.send_to_ws(channel, msg).await;
            if sent == false {
                return false;
            }
        }
        true
    }

    async fn send_to_ws_raw(&mut self, channel: i32, msg: String) -> bool {
        let serialized = serialize_raw_with_channel_prefix(channel, &msg);
        let res = self.websocket.send(Message::Text(serialized.into())).await;
        if res.is_err() {
            return false;
        }
        trace!(
            "client-{}/channel-{}: sent message to websocket",
            self.client_id, channel
        );
        true
    }
}

#[derive(Clone)]
pub struct ClientHandle {
    sender: mpsc::UnboundedSender<ClientActorMessage>,
}

impl ClientHandle {
    pub fn new(
        client_id: i32,
        user_id: String,
        websocket: WebSocket,
        sinkron: SinkronHandle,
    ) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let handle = Self { sender };
        let mut actor = ClientActor::new(
            user_id,
            client_id,
            websocket,
            sinkron,
            receiver,
            handle.clone(),
        );
        tokio::spawn(async move { actor.run().await });
        handle
    }

    pub fn send(&self, msg: ClientActorMessage) {
        // XXX should return error
        _ = self.sender.send(msg);
    }
}
