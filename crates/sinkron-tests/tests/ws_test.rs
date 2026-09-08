use futures_util::{
    SinkExt,
    StreamExt,
    // stream::{SplitSink, SplitStream},
};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use tungstenite::protocol::Message;
use uuid::Uuid;

use sinkron_client::SinkronClient;
use sinkron_common::error::SinkronError;
use sinkron_common::protocol::{
    ClientMessage, DocMessage, ServerDeleteMessage, ServerMessage,
    SyncCompleteMessage, SyncErrorMessage, SyncStartMessage,
};
use sinkron_common::types::{CreateCollection, CreateDocument, DeleteDocument};

const API_URL: &'static str = "http://localhost:3000";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

fn ws_url(token: &'static str) -> String {
    format!("ws://localhost:3000/sync?token={token}")
}
const WS_AUTH_TOKEN: &'static str = "token-test";

struct WsTest {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    // sender: SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>,
    // receiver: SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>
}

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
    msg: &ClientMessage,
) -> Option<String> {
    let mut res = channel.to_string() + ":";
    match serde_json::to_writer(unsafe { res.as_mut_vec() }, &msg) {
        Ok(_) => Some(res),
        Err(_) => None,
    }
}

impl WsTest {
    async fn new_or_fail(url: String) -> Self {
        let (ws, _) = connect_async(&url).await.expect("Failed to connect");
        // let (sender, receiver) = ws_stream.split();
        Self { ws }
    }

    async fn next_or_fail(&mut self) -> (i32, ServerMessage) {
        let Some(res) = self.ws.next().await else {
            panic!("Failed to receive message from websocket");
        };
        let Ok(msg) = res else {
            panic!("Failed to receive message from websocket");
        };
        let Message::Text(str) = msg else {
            panic!("Unsupported message type");
        };
        let Some((channel_id, body)) = parse_channel_prefix(&str) else {
            panic!("Failed to parse channel prefix");
        };
        let parsed = serde_json::from_str::<ServerMessage>(&body)
            .expect("Failed to parse message body");
        (channel_id, parsed)
    }

    async fn send_or_fail(&mut self, chan: i32, msg: ClientMessage) {
        let Some(serialized) = serialize_with_channel_prefix(chan, &msg) else {
            panic!("Failed to serialize message");
        };
        self.ws
            .send(Message::Text(serialized.into()))
            .await
            .expect("Failed to send to websocket")
    }

    fn close(&self) {
        // TODO
    }
}

#[tokio::test]
async fn test_connect() {
    let col = Uuid::new_v4().to_string();

    // Prepare - Create collection
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: "TODO".to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    // TODO other way to AUTH FAILED ?
    // invalid auth token
    {
        let url = ws_url("INVALID_TOKEN");
        let mut conn = WsTest::new_or_fail(url).await;
        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 0);
        assert!(matches!(
            msg,
            ServerMessage::SyncError(SyncErrorMessage {
                col: a_col,
                error: SinkronError::AuthFailed { message: _ }
            }) if a_col == col
        ));

        conn.close();
    }

    // invalid col
    {
        let url = ws_url(WS_AUTH_TOKEN);
        let mut conn = WsTest::new_or_fail(url).await;

        let invalid_col = "INVALID_COL".to_string();
        conn.send_or_fail(
            1,
            ClientMessage::SyncStart(SyncStartMessage {
                col: invalid_col.clone(),
                colrev: 0,
            }),
        )
        .await;

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert!(matches!(
            msg,
            ServerMessage::SyncError(SyncErrorMessage {
                col,
                error: SinkronError::NotFound { message: _ }
            }) if col == invalid_col
        ));

        conn.close();
    }

    // invalid colrev
    {
        let url = ws_url(WS_AUTH_TOKEN);
        let mut conn = WsTest::new_or_fail(url).await;

        conn.send_or_fail(
            1,
            ClientMessage::SyncStart(SyncStartMessage {
                col: col.clone(),
                colrev: 12345,
            }),
        )
        .await;

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::SyncError(SyncErrorMessage {
                col: col.clone(),
                error: SinkronError::InvalidColrev
            })
        );

        conn.close();
    }

    // valid
    {
        let url = ws_url(WS_AUTH_TOKEN);
        let mut conn = WsTest::new_or_fail(url).await;

        conn.send_or_fail(
            1,
            ClientMessage::SyncStart(SyncStartMessage {
                col: col.clone(),
                colrev: 0,
            }),
        )
        .await;

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::SyncComplete(SyncCompleteMessage { col, colrev: 0 })
        );

        conn.close();
    }
}

#[tokio::test]
async fn test_sync() {
    let col = Uuid::new_v4().to_string();

    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    // Prepare:
    // - Create collection
    // - Create doc1
    // - Create doc2
    // - Delete doc2
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: "TODO".to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    let res = client
        .create_document(CreateDocument {
            id: Uuid::new_v4(),
            col: col.clone(),
            content: "TODO".to_string(),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    let doc1 = res.expect("couldn't create doc1");

    let res = client
        .create_document(CreateDocument {
            id: Uuid::new_v4(),
            col: col.clone(),
            content: "TODO".to_string(),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    let doc2 = res.expect("couldn't create doc2");

    let res = client
        .delete_document(DeleteDocument {
            id: doc2.id,
            col: col.clone(),
        })
        .await;
    let doc2_deleted = res.expect("couldn't delete doc2");

    // sync without colrev:
    //   should recieve doc1
    {
        let url = ws_url(WS_AUTH_TOKEN);
        let mut conn = WsTest::new_or_fail(url).await;

        conn.send_or_fail(
            1,
            ClientMessage::SyncStart(SyncStartMessage {
                col: col.clone(),
                colrev: 0,
            }),
        )
        .await;

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert!(matches!(
            msg,
            ServerMessage::Doc(DocMessage {
                id,
                col: a_col,
                colrev,
                ..
            }) if id == doc1.id && a_col == col && colrev == doc1.colrev
        ));

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::SyncComplete(SyncCompleteMessage {
                col: col.clone(),
                colrev: 1 // TODO doc2_deleted.colrev
            })
        );

        conn.close();
    }

    // sync after doc2 was created but before it was deleted:
    //   should receive "delete" message for doc2
    {
        let url = ws_url(WS_AUTH_TOKEN);
        let mut conn = WsTest::new_or_fail(url).await;

        conn.send_or_fail(
            1,
            ClientMessage::SyncStart(SyncStartMessage {
                col: col.clone(),
                colrev: doc2.colrev,
            }),
        )
        .await;

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::Delete(ServerDeleteMessage {
                id: doc2.id,
                col: col.clone(),
                colrev: 1 // TODO doc2_deleted.colrev
            })
        );

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::SyncComplete(SyncCompleteMessage {
                col: col.clone(),
                colrev: 1 // TODO doc2_deleted.colrev
            })
        );

        conn.close();
    }
}
