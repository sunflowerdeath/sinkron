use base64::prelude::*;
use futures_util::{SinkExt, StreamExt};
use loro::{ExportMode, LoroDoc};
use reqwest;
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::json;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use tungstenite::protocol::Message;
use uuid::Uuid;

use sinkron_client::SinkronClient;
use sinkron_common::error::{SinkronError, SinkronErrorResponseBody};
use sinkron_common::permissions::{Permissions, Role};
use sinkron_common::protocol::*;
use sinkron_common::types::{CreateCollection, CreateDocument, DeleteDocument};

const API_URL: &'static str = "http://localhost:3000/api";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

fn ws_url(token: &'static str) -> String {
    format!("ws://localhost:3000/sync?token={token}")
}
const USER_AUTH_TOKEN: &'static str = "token-test";
const PUBLIC_API_URL: &'static str = "http://localhost:3000/";

struct WsTest {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    // sender: SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>,
    // receiver: SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>
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

    async fn close(&mut self) {
        let _ = self.ws.close(None).await;
    }
}

fn any_permissions() -> Permissions {
    Permissions {
        read: vec![Role::Any],
        create: vec![Role::Any],
        update: vec![Role::Any],
        delete: vec![Role::Any],
    }
}

fn new_test_doc() -> LoroDoc {
    let doc = LoroDoc::new();
    doc.get_text("text").insert(0, "Hello!").unwrap();
    doc
}

fn serialize_doc(doc: &LoroDoc) -> String {
    let snapshot = doc.export(loro::ExportMode::Snapshot).unwrap();
    BASE64_STANDARD.encode(snapshot)
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
            permissions: any_permissions().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    // invalid auth token
    {
        let url = ws_url("INVALID_TOKEN");
        let mut conn = WsTest::new_or_fail(url).await;
        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 0);
        assert!(matches!(
            msg,
            ServerMessage::ConnectionError(SinkronError::AuthFailed {
                message: _
            })
        ));

        conn.close().await;
    }

    // invalid col
    {
        let url = ws_url(USER_AUTH_TOKEN);
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

        conn.close().await;
    }

    // invalid colrev
    {
        let url = ws_url(USER_AUTH_TOKEN);
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

        conn.close().await;
    }

    // valid
    {
        let url = ws_url(USER_AUTH_TOKEN);
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

        conn.close().await;
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
            permissions: any_permissions().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    let res = client
        .create_document(CreateDocument {
            id: Uuid::new_v4(),
            col: col.clone(),
            content: serialize_doc(&new_test_doc()),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    let doc1 = res.expect("couldn't create doc1");

    let res = client
        .create_document(CreateDocument {
            id: Uuid::new_v4(),
            col: col.clone(),
            content: serialize_doc(&new_test_doc()),
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
        let url = ws_url(USER_AUTH_TOKEN);
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
                colrev: 3 // TODO doc2_deleted.colrev
            })
        );

        conn.close().await;
    }

    // sync after doc2 was created but before it was deleted:
    //   should receive "delete" message for doc2
    {
        let url = ws_url(USER_AUTH_TOKEN);
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
                colrev: 3 // TODO doc2_deleted.colrev
            })
        );

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            ServerMessage::SyncComplete(SyncCompleteMessage {
                col: col.clone(),
                colrev: 3 // TODO doc2_deleted.colrev
            })
        );

        conn.close().await;
    }
}

#[tokio::test]
async fn test_crud() {
    let col = Uuid::new_v4().to_string();

    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    // Create collection
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: any_permissions().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    let url = ws_url(USER_AUTH_TOKEN);
    let mut conn = WsTest::new_or_fail(url).await;

    // sync
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
        ServerMessage::SyncComplete(SyncCompleteMessage {
            col: col.clone(),
            colrev: 0
        })
    );

    // create doc
    let id = Uuid::new_v4();
    let loro_doc = new_test_doc();
    let content = serialize_doc(&loro_doc);

    conn.send_or_fail(
        1,
        ClientMessage::Create(ClientCreateMessage {
            id,
            col: col.clone(),
            content,
            files: Vec::new(),
        }),
    )
    .await;

    let (chan, msg) = conn.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::Doc(DocMessage {
            id: an_id,
            col: a_col,
            ..
        }) if an_id == id && a_col == col
    ));

    // get
    conn.send_or_fail(
        1,
        ClientMessage::Get(GetMessage {
            id,
            col: col.clone(),
        }),
    )
    .await;

    let (chan, msg) = conn.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::Doc(DocMessage {
            id: an_id,
            col: a_col,
            ..
        }) if an_id == id && a_col == col
    ));

    // get error
    conn.send_or_fail(
        1,
        ClientMessage::Get(GetMessage {
            id: Uuid::new_v4(), // <- not found id
            col: col.clone(),
        }),
    )
    .await;

    let (chan, msg) = conn.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::GetError(GetErrorMessage {
            error: SinkronError::NotFound { message: _ },
            ..
        })
    ));

    // update
    let vv = loro_doc.oplog_vv();
    loro_doc.get_text("update").insert(0, "Update!").unwrap();
    let update = loro_doc.export(ExportMode::updates(&vv)).unwrap();
    let serialized_update = BASE64_STANDARD.encode(update);

    conn.send_or_fail(
        1,
        ClientMessage::Update(ClientUpdateMessage {
            id,
            col: col.clone(),
            content_update: Some(serialized_update),
            files_update: None,
        }),
    )
    .await;

    let (chan, msg) = conn.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::Update(ServerUpdateMessage {
            col: a_col,
            id: an_id,
            ..
        }) if a_col == col && an_id == id
    ));

    // delete
    conn.send_or_fail(
        1,
        ClientMessage::Delete(ClientDeleteMessage {
            id,
            col: col.clone(),
        }),
    )
    .await;

    let (chan, msg) = conn.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::Delete(ServerDeleteMessage {
            col: a_col,
            id: an_id,
            ..
        }) if a_col == col && an_id == id
    ));
}

#[tokio::test]
async fn test_permissions() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    let readonly = "user-readonly".to_string();
    let editor = "user-editor".to_string();
    let permissions = Permissions {
        read: vec![
            Role::User { id: readonly },
            Role::User { id: editor.clone() },
        ],
        create: vec![Role::User { id: editor.clone() }],
        update: vec![Role::User { id: editor.clone() }],
        delete: vec![Role::User { id: editor.clone() }],
    };

    // create collection
    let col = Uuid::new_v4().to_string();
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: permissions.to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    let sync_msg = ClientMessage::SyncStart(SyncStartMessage {
        col: col.clone(),
        colrev: 0,
    });

    // forbidden: sync should fail
    let mut ws_forbidden = WsTest::new_or_fail(ws_url("token-forbidden")).await;
    ws_forbidden.send_or_fail(1, sync_msg.clone()).await;
    let (chan, msg) = ws_forbidden.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::SyncError(SyncErrorMessage {
            col: a_col,
            error: SinkronError::Forbidden { message: _ },
        }) if a_col == col
    ));

    // readonly: sync should success, change should fail
    let mut ws_readonly = WsTest::new_or_fail(ws_url("token-readonly")).await;
    ws_readonly.send_or_fail(1, sync_msg.clone()).await;
    let (chan, msg) = ws_readonly.next_or_fail().await;
    assert_eq!(chan, 1);
    assert_eq!(
        msg,
        ServerMessage::SyncComplete(SyncCompleteMessage {
            col: col.clone(),
            colrev: 0
        })
    );

    let id = Uuid::new_v4();
    let loro_doc = new_test_doc();
    let content = serialize_doc(&loro_doc);
    ws_readonly
        .send_or_fail(
            1,
            ClientMessage::Create(ClientCreateMessage {
                id,
                col: col.clone(),
                content: content.clone(),
                files: Vec::new(),
            }),
        )
        .await;
    let (chan, msg) = ws_readonly.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::ChangeError(ChangeErrorMessage {
            id: an_id,
            col: a_col,
            error: SinkronError::Forbidden { message: _ }
        }) if an_id == id && a_col == col
    ));

    // editor: sync should success, change should success
    let mut ws_editor = WsTest::new_or_fail(ws_url("token-editor")).await;
    ws_editor.send_or_fail(1, sync_msg.clone()).await;
    let _ = ws_editor.next_or_fail().await;

    ws_editor
        .send_or_fail(
            1,
            ClientMessage::Create(ClientCreateMessage {
                id,
                col: col.clone(),
                content,
                files: Vec::new(),
            }),
        )
        .await;
    let (chan, msg) = ws_readonly.next_or_fail().await;
    assert_eq!(chan, 1);
    assert!(matches!(
        msg,
        ServerMessage::Doc(DocMessage {
            id: an_id,
            col: a_col,
            ..
        }) if an_id == id && a_col == col
    ));
}

// enum SendReqwestError {
// RequestError(String),
// SinkronError(),
// }

async fn send_reqwest(
    url: &str,
    auth_token: &str,
    payload: String,
) -> reqwest::Response {
    let mut headers = HeaderMap::new();
    headers
        .insert("content-type", HeaderValue::from_static("application/json"));
    headers.insert("accept", HeaderValue::from_static("application/json"));
    headers.insert(
        "x-sinkron-auth-token",
        HeaderValue::from_str(auth_token).unwrap(),
    );

    let client = reqwest::Client::new();
    let url = "".to_string() + PUBLIC_API_URL + url;
    let res = client.post(url).headers(headers).body(payload).send().await;
    res.expect("Couldn't send reqwest")
}

#[tokio::test]
async fn test_files() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    // create collection
    let col = Uuid::new_v4().to_string();
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: any_permissions().to_string(),
            storage_limit: 1024 * 1024 * 10, // 10 Mb
        })
        .await;
    assert!(res.is_ok());

    // init file over collection storage limit
    let file_id = Uuid::new_v4();
    let payload = json!({
        "col_id": col.clone(),
        "file_id": file_id,
        "size": 1024 * 1024 * 20, // 20 Mb
        "checksum": "", // TODO checksum
    })
    .to_string();
    let res =
        send_reqwest("files/init_file_upload", USER_AUTH_TOKEN, payload).await;
    assert!(!res.status().is_success());
    let err = res
        .json::<SinkronErrorResponseBody<SinkronError>>()
        .await
        .expect("Couldn't parse error");
    assert!(matches!(
        err,
        SinkronErrorResponseBody {
            error: SinkronError::InsufficientStorage
        }
    ));

    // init file
    let file_id = Uuid::new_v4();
    let payload = json!({
        "col_id": col.clone(),
        "file_id": file_id,
        "size": 1024 * 1024 * 4, // 4 Mb
        "checksum": "", // TODO checksum
    })
    .to_string();
    let res =
        send_reqwest("files/init_file_upload", USER_AUTH_TOKEN, payload).await;
    assert!(res.status().is_success());

    // upload chunks

    // create document with file
}
