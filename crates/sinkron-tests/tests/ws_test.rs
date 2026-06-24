use futures_util::{
    StreamExt,
    stream::{SplitSink, SplitStream},
};
use tokio::net::TcpStream;
use tokio_tungstenite::{WebSocketStream, connect_async};
use tungstenite::protocol::Message;
use uuid::Uuid;

use sinkron::protocol::{
    ClientMessage, ErrorCode, ServerMessage, SyncErrorMessage,
};

const API_URL: &'static str = "http://localhost:3000";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

const SYNC_AUTH_TOKEN: &'static str = "token-test";

fn ws_url(token: &'static str) -> String {
    format!("ws://localhost:3000/sync?token={token}")
}

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
        match self.ws.next().await {
            Some(data) => {
                // parse message
            }
            None => {
                panic!("Failed to receive message");
            }
        }
    }

    async fn send_or_fail(&self, chan: i32, msg: ClientMessage) {
        self.ws.send("Hello").await.expect("Failed to send")
    }

    // close()
}

#[tokio::test]
async fn test_connect() {
    let col = Uuid::new_v4().to_string();
    // const client = new SinkronClient({ url: apiUrl, token: apiToken })
    // const permissions = Permissions.any()
    // const create_res = await client.create_collection({
    // id: col,
    // permissions
    // })
    // assert(createRes.isOk, "create col")

    // invalid auth token
    {
        let url = ws_url("INVALID_TOKEN");
        let conn = WsTest::new_or_fail(url).await;
        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 0);
        assert_eq!(
            msg,
            SyncErrorMessage {
                col,
                code: AuthFailed,
            }
        );

        conn.close();
    }

    // invalid col
    {
        let url = ws_url("VALID_TOKEN");
        let conn = WsTest::new_or_fail(url).await;

        conn.send(
            1,
            SyncMessage {
                col: "INVALID_COL".to_string(),
                colrev: 0,
            },
        );

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            SyncErrorMessage {
                col: "INVALID_COL".to_string(),
                code: NotFound,
            }
        );

        conn.close();
    }

    // invalid colrev
    {
        let url = ws_url("VALID_TOKEN");
        let conn = WsTest::new_or_fail(url).await;

        conn.send(1, SyncMessage { col, colrev: 12345 });

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(
            msg,
            SyncErrorMessage {
                col,
                code: UnprocessableContent,
            }
        );

        conn.close();
    }

    // valid
    {
        let url = ws_url("VALID_TOKEN");
        let conn = WsTest::new_or_fail(url).await;

        conn.send(1, SyncMessage { col, colrev: 0 });

        let (chan, msg) = conn.next_or_fail().await;
        assert_eq!(chan, 1);
        assert_eq!(msg, SyncCompleteMessage { col, colrev: 0 });

        conn.close();
    }
}

#[tokio::test]
async fn test_sync() {
    let col = Uuid::new_v4().to_string();

    // const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
    // const permissions = Permissions.any()
    // const createRes = await sinkron.createCollection({
    // id: col,
    // permissions
    // })
    // assert(createRes.isOk, "create col")

    // const createDoc1Res = await sinkron.createDocument({
    // col,
    // id: uuidv4(),
    // data: testDoc()
    // })
    // assert(createDoc1Res.isOk, "create doc 1")
    // const doc1 = createDoc1Res.value

    // const createDoc2Res = await sinkron.createDocument({
    // col,
    // id: uuidv4(),
    // data: testDoc()
    // })
    // assert(createDoc2Res.isOk, "create doc 2")
    // const doc2 = createDoc2Res.value
    // const deleteDoc2Res = await sinkron.deleteDocument({
    // col,
    // id: doc2.id
    // })
    // assert(deleteDoc2Res.isOk, "delete doc 2")
    // const doc2deleted = deleteDoc2Res.value

    // sync without colrev
    {
        let conn = WsTest::new_or_fail(ws_url(SYNC_AUTH_TOKEN)).await;
        conn.send_or_fail(1, SyncMessage { col, colrev: 0 }).await;

        let (chan, msg) = ws.next_or_fail().await;
        // assertIsMatch(e2, {
        // kind: "message",
        // data: { kind: "doc", id: doc1.id }
        // })
        let (chan, msg) = ws.next_or_fail().await;
        // assertIsMatch(e3, {
        // kind: "message",
        // data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
        // })
        ws.close();
    }

    // sync with colrev
    {
        let conn = WsTest::new_or_fail(ws_url(SYNC_AUTH_TOKEN)).await;
        conn.send_or_fail(
            1,
            SyncMessage {
                col,
                colrev: doc2.colrev,
            },
        )
        .await;

        let (chan, msg) = ws.next_or_fail().await;
        // assertIsMatch(e2, {
        // kind: "message",
        // data: { kind: "doc", col, id: doc2.id, data: null }
        // })
        let (chan, msg) = ws.next_or_fail().await;
        // assertIsMatch(e3, {
        // kind: "message",
        // data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
        // })

        ws.close();
    }
}
