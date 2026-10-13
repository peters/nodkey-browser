//! nodkey-proto for the browser extension (WebAssembly). The extension keeps its private keys as
//! non-extractable WebCrypto keys and does the two steps that need them (Ed25519 signing and the
//! X25519 key agreement) itself; everything else about the protocol runs here, from the same
//! code the `nodkey` command line uses. See `core.rs` for what each function does.

mod core;

use wasm_bindgen::prelude::*;

fn js<T>(r: Result<T, String>) -> Result<T, JsError> {
    r.map_err(|e| JsError::new(&e))
}

#[wasm_bindgen]
pub fn protocol_version() -> u8 {
    core::protocol_version()
}

#[wasm_bindgen]
pub fn random_id() -> String {
    core::random_id()
}

#[wasm_bindgen]
pub fn b64u_encode(bytes: &[u8]) -> String {
    core::b64u_encode(bytes)
}

#[wasm_bindgen]
pub fn b64u_decode(s: &str) -> Result<Vec<u8>, JsError> {
    js(core::b64u_decode(s))
}

#[wasm_bindgen]
pub fn normalize_code(input: &str) -> Result<String, JsError> {
    js(core::normalize_code(input))
}

#[wasm_bindgen]
pub fn display_code(code: &str) -> String {
    core::display_code(code)
}

#[wasm_bindgen]
pub fn check_number(
    agent_sign: &str,
    agent_kem: &str,
    phone_sign: &str,
    phone_kem: &str,
) -> Result<String, JsError> {
    js(core::check_number(
        agent_sign, agent_kem, phone_sign, phone_kem,
    ))
}

#[wasm_bindgen]
pub fn auth_message(method: &str, path: &str, ts: f64, body: &[u8]) -> String {
    core::auth_message(method, path, ts, body)
}

#[wasm_bindgen]
pub fn auth_header(id: &str, ts: f64, signature: &[u8]) -> Result<String, JsError> {
    js(core::auth_header(id, ts, signature))
}

#[wasm_bindgen]
pub fn sniff_image(bytes: &[u8]) -> Option<String> {
    core::sniff_image(bytes)
}

#[wasm_bindgen]
pub fn seal_request(
    draft_json: &str,
    agent_id: &str,
    phone_kem: &str,
    ts: f64,
) -> Result<String, JsError> {
    js(core::seal_request(draft_json, agent_id, phone_kem, ts))
}

#[wasm_bindgen]
pub fn seal_password(agent_id: &str, phone_kem: &str, password: &str) -> Result<String, JsError> {
    js(core::seal_password(agent_id, phone_kem, password))
}

#[wasm_bindgen]
pub fn seal_attachment(
    request_id: &str,
    agent_id: &str,
    phone_kem: &str,
    image: &[u8],
) -> Result<Vec<u8>, JsError> {
    js(core::seal_attachment(
        request_id, agent_id, phone_kem, image,
    ))
}

#[wasm_bindgen]
pub fn open_answer(
    dh: &[u8],
    agent_kem: &str,
    sealed_json: &str,
    request_id: &str,
    phone_id: &str,
) -> Result<String, JsError> {
    js(core::open_answer(
        dh,
        agent_kem,
        sealed_json,
        request_id,
        phone_id,
    ))
}

#[wasm_bindgen]
pub fn open_grant(
    dh: &[u8],
    agent_sign: &str,
    agent_kem: &str,
    claimed_json: &str,
    code: &str,
) -> Result<String, JsError> {
    js(core::open_grant(
        dh,
        agent_sign,
        agent_kem,
        claimed_json,
        code,
    ))
}

#[wasm_bindgen]
pub fn client_data_json(op: &str, challenge: &str, origin: &str) -> Result<String, JsError> {
    js(core::client_data_json(op, challenge, origin))
}

#[wasm_bindgen]
pub fn check_passkey_answer(request_json: &str, answer_json: &str) -> Result<(), JsError> {
    js(core::check_passkey_answer(request_json, answer_json))
}
