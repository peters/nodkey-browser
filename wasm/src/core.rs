//! The protocol steps behind the exported functions in `lib.rs`, with plain `String` errors so
//! they run in native tests too.
//!
//! nodkey-proto for the browser extension. The extension keeps its private keys as
//! non-extractable WebCrypto keys and does the two steps that need them (Ed25519 signing and the
//! X25519 key agreement) itself; everything else about the protocol runs here, from the same
//! code the `nodkey` command line uses.
//!
//! Strings in and out are JSON or base64url. Times come from JavaScript: there is no clock on
//! `wasm32-unknown-unknown`.

use nodkey_proto::{
    CardRequest, ClientInfo, ImageType, Kind, PasskeyAnswer, PasskeyOp, PasskeyRequest, PublicKeys,
    Purpose, Request, SaveCard, SaveLogin, SealedBox, Suggestion, VERSION, auth, b64u, client,
    code, dh, passkey, webauthn,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

fn js(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The protocol version this build speaks.
pub fn protocol_version() -> u8 {
    VERSION
}

/// A new random id (16 bytes, base64url).
pub fn random_id() -> String {
    nodkey_proto::random_id()
}

pub fn b64u_encode(bytes: &[u8]) -> String {
    b64u::encode(bytes)
}

pub fn b64u_decode(s: &str) -> Result<Vec<u8>, String> {
    b64u::decode(s).map_err(js)
}

/// A typed pairing code (`k7p-2qx`, `K7P2QX`) in its canonical form, or an error.
pub fn normalize_code(input: &str) -> Result<String, String> {
    code::normalize(input).map_err(js)
}

/// A canonical pairing code as shown: `K7P-2QX`.
pub fn display_code(code: &str) -> String {
    code::display(code)
}

pub(crate) fn keys(sign: &str, kem: &str) -> Result<PublicKeys, String> {
    PublicKeys::from_b64u(sign, kem).map_err(js)
}

/// The message to sign with the agent's Ed25519 key for one relay call. `path` includes the
/// query string exactly as sent.
pub fn auth_message(method: &str, path: &str, ts: f64, body: &[u8]) -> String {
    auth::message(method, path, ts as u64, body)
}

/// The `Nodkey-Auth` header value from the signature over [`auth_message`].
pub fn auth_header(id: &str, ts: f64, signature: &[u8]) -> Result<String, String> {
    if signature.len() != 64 {
        return Err(String::from("an Ed25519 signature has 64 bytes"));
    }
    Ok(format!("{id}.{}.{}", ts as u64, b64u::encode(signature)))
}

/// `"image/png"`, `"image/jpeg"` or `"image/gif"` from the first bytes, else `undefined`.
pub fn sniff_image(bytes: &[u8]) -> Option<String> {
    ImageType::sniff(bytes).map(|t| {
        match t {
            ImageType::Png => "image/png",
            ImageType::Jpeg => "image/jpeg",
            ImageType::Gif => "image/gif",
        }
        .to_owned()
    })
}

/// What the extension fills in for a request; the rest (`v`, `request_id`, `ts`) is added here.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Draft {
    kind: Kind,
    #[serde(default)]
    target: String,
    reason: String,
    agent: String,
    /// The caption of the picture that goes with the request (`image` of [`request_to_sign`]).
    #[serde(default)]
    caption: Option<String>,
    #[serde(default)]
    save: Option<SaveLogin>,
    #[serde(default)]
    passkey: Option<PasskeyRequest>,
    #[serde(default)]
    card: Option<CardRequest>,
    #[serde(default)]
    save_card: Option<SaveCard>,
    #[serde(default)]
    client: Option<ClientInfo>,
    #[serde(default)]
    suggest: Option<Suggestion>,
    #[serde(default)]
    wait_seconds: Option<u32>,
}

/// A request to sign: the extension signs `message` with its Ed25519 key in WebCrypto and gives
/// `body` and the signature to [`seal_signed_request`].
#[derive(Serialize)]
struct ToSign {
    request_id: String,
    /// b64u of the request's JSON.
    body: String,
    /// b64u of the bytes to sign ("Signed requests and answers").
    message: String,
    /// The agent's nonce of a `pairing_check` (b64u), for [`finish_pairing`].
    #[serde(skip_serializing_if = "Option::is_none")]
    nonce: Option<String>,
}

fn to_sign(request: &Request, agent_id: &str, phone_id: &str) -> Result<ToSign, String> {
    client::check_request(request)?;
    let t = client::request_to_sign(request, agent_id, phone_id).map_err(js)?;
    Ok(ToSign {
        request_id: request.request_id.clone(),
        body: b64u::encode(&t.body),
        message: b64u::encode(&t.message),
        nonce: request.nonce.clone(),
    })
}

/// Checks a request and makes it ready to sign. `draft_json` is
/// `{kind, target, reason, agent, caption?, save?, passkey?, card?, save_card?, client?, suggest?,
/// wait_seconds?}`; `image` is the picture that goes with it (empty for none): the request then
/// says its type, size and SHA-256. Returns `{request_id, body, message}`.
pub fn request_to_sign(
    draft_json: &str,
    agent_id: &str,
    phone_id: &str,
    ts: f64,
    image: &[u8],
) -> Result<String, String> {
    let d: Draft = serde_json::from_str(draft_json).map_err(js)?;
    let attachment = if image.is_empty() {
        None
    } else {
        let kind = ImageType::sniff(image).ok_or("the picture is not PNG, JPEG or GIF")?;
        Some(client::attachment_info(kind, image, d.caption))
    };
    let request = Request {
        v: VERSION,
        request_id: nodkey_proto::random_id(),
        kind: d.kind,
        target: d.target.trim().to_owned(),
        reason: d.reason.trim().to_owned(),
        agent: d.agent,
        ts: ts as u64,
        attachment,
        filter: None,
        save: d.save,
        passkey: d.passkey,
        bundle: None,
        card: d.card,
        save_card: d.save_card,
        client: d.client.map(ClientInfo::tidy),
        session_id: None,
        suggest: d.suggest,
        wait_seconds: d.wait_seconds,
        save_secret: None,
        project: None,
        nonce: None,
    };
    serde_json::to_string(&to_sign(&request, agent_id, phone_id)?).map_err(js)
}

#[derive(Serialize)]
struct Sealed {
    request_id: String,
    envelope: nodkey_proto::RequestEnvelope,
}

/// Seals a request from [`request_to_sign`] (or [`pairing_check_to_sign`]) with its Ed25519
/// signature (64 bytes) to the phone; returns `{request_id, envelope}` where `envelope` is the
/// body of `POST /v1/phones/{id}/requests`.
pub fn seal_signed_request(
    body_b64u: &str,
    signature: &[u8],
    agent_id: &str,
    phone_kem: &str,
) -> Result<String, String> {
    let body = Zeroizing::new(b64u::decode(body_b64u).map_err(js)?);
    let request: Request = serde_json::from_slice(&body).map_err(js)?;
    client::check_request(&request)?;
    let sig: [u8; 64] = signature
        .try_into()
        .map_err(|_| String::from("an Ed25519 signature has 64 bytes"))?;
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    let envelope = client::seal_signed_request(
        &request,
        &body,
        &sig,
        agent_id,
        &kem,
        request.attachment.is_some(),
    )
    .map_err(js)?;
    serde_json::to_string(&Sealed {
        request_id: request.request_id.clone(),
        envelope,
    })
    .map_err(js)
}

/// Seals a password for a `save` request to the phone on its own; returns `{enc, ct}`. Call it
/// the moment the password is read, and keep only the result.
pub fn seal_password(agent_id: &str, phone_kem: &str, password: &str) -> Result<String, String> {
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    let sealed = client::seal_password(agent_id, &kem, password).map_err(js)?;
    serde_json::to_string(&sealed).map_err(js)
}

/// Seals a picture for `PUT /v1/requests/{request_id}/attachment` (the raw body).
pub fn seal_attachment(
    request_id: &str,
    agent_id: &str,
    phone_kem: &str,
    image: &[u8],
) -> Result<Vec<u8>, String> {
    let kem = b64u::decode_array::<32>(phone_kem).map_err(js)?;
    client::seal_attachment(request_id, agent_id, &kem, image).map_err(js)
}

/// `clientDataJSON` for a passkey call as WebAuthn makes it, in b64u. `op` is `get` or `create`;
/// `origin` is the caller's origin as the browser reports it, never a value from the page.
pub fn client_data_json(op: &str, challenge: &str, origin: &str) -> Result<String, String> {
    let op = match op {
        "get" => PasskeyOp::Get,
        "create" => PasskeyOp::Create,
        _ => return Err(format!("unknown passkey op {op}")),
    };
    let json = passkey::build_client_data_json(op, challenge, origin);
    Ok(b64u::encode(json.as_bytes()))
}

/// The agent's check of an approved passkey answer: `request_json` is the request's `passkey`,
/// `answer_json` the answer's `passkey`.
pub fn check_passkey_answer(request_json: &str, answer_json: &str) -> Result<(), String> {
    let request: PasskeyRequest = serde_json::from_str(request_json).map_err(js)?;
    let answer: PasskeyAnswer = serde_json::from_str(answer_json).map_err(js)?;
    webauthn::check_answer(&request, &answer)
}

pub(crate) fn open(
    purpose: Purpose,
    dh: &[u8],
    agent_kem: &str,
    sealed: &SealedBox,
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    let dh: [u8; 32] = dh
        .try_into()
        .map_err(|_| String::from("the X25519 result has 32 bytes"))?;
    let pk = b64u::decode_array::<32>(agent_kem).map_err(js)?;
    let enc = b64u::decode(&sealed.enc).map_err(js)?;
    let ct = b64u::decode(&sealed.ct).map_err(js)?;
    dh::open_with_dh(purpose.info().as_bytes(), &dh, &pk, &enc, aad, &ct).map_err(js)
}

/// The phone an answer comes from, as the extension keeps it from the pairing.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Source {
    agent_id: String,
    phone_id: String,
    /// The phone's Ed25519 key (b64u), pinned at pairing.
    sign: String,
    /// The phone signs its answers: an answer without a valid signature is refused.
    signs: bool,
}

#[derive(Serialize)]
struct Read {
    answer: nodkey_proto::Answer,
    /// The answer had a valid signature: from now on this phone must sign.
    signed: bool,
}

/// Opens the phone's answer (`{enc, ct}` from `GET /v1/requests/{id}`) given
/// `dh = X25519(agent secret, enc)`, and checks its signature. `from_json` is
/// `{agent_id, phone_id, sign, signs}`. Returns `{answer, signed}` (the answer may hold a code or
/// password). An answer without a valid signature from a phone that signs fails with
/// `not_signed`.
pub fn open_answer(
    dh: &[u8],
    agent_kem: &str,
    sealed_json: &str,
    request_id: &str,
    from_json: &str,
) -> Result<String, String> {
    let sealed: SealedBox = serde_json::from_str(sealed_json).map_err(js)?;
    let from: Source = serde_json::from_str(from_json).map_err(js)?;
    let sign = b64u::decode_array::<32>(&from.sign).map_err(js)?;
    let plain = open(
        Purpose::Answer,
        dh,
        agent_kem,
        &sealed,
        &client::answer_aad(request_id, &from.phone_id),
    )?;
    let from = client::AnswerFrom {
        agent_id: &from.agent_id,
        phone_id: &from.phone_id,
        sign: &sign,
        signs: from.signs,
    };
    let (answer, signed) = client::read_answer(&plain, request_id, &from).map_err(coded)?;
    serde_json::to_string(&Read { answer, signed }).map_err(js)
}

/// The errors the extension tells apart, as stable codes; any other error as its text.
pub(crate) fn coded(e: nodkey_proto::Error) -> String {
    match e {
        nodkey_proto::Error::OldApp => "old_app".into(),
        nodkey_proto::Error::BadSignature(_) => "not_signed".into(),
        nodkey_proto::Error::BadCommitment(_) => "bad_pairing_check".into(),
        other => other.to_string(),
    }
}

pub mod cards;
pub mod pairing;
pub mod signin;
pub mod sites;

#[cfg(test)]
mod tests;
