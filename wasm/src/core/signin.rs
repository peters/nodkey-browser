//! Sign-in methods ("Sign-in methods" in the protocol): the site a suggestion names, where the
//! provider login (`via`) may be filled, and which second step to choose. The rules are
//! `nodkey_proto::signin`, as the `nodkey` command line uses them.

use nodkey_proto::{SecondStep, SecondStepOrder, SignInMethod, Via, signin};

use super::js;

/// The site as a suggestion names it (`https://www.Example.com/login` → `example.com`), or
/// `undefined` when the value is not a website.
pub fn site(value: &str) -> Option<String> {
    signin::site(value)
}

/// Whether the provider login of `method` may be filled on a page at `host` when the request was
/// for `target`. `via_json` needs only the `account` of the answer's `via` (no secret).
pub fn may_fill_via(
    host: &str,
    target: &str,
    method_json: &str,
    via_json: &str,
) -> Result<bool, String> {
    let method: SignInMethod = serde_json::from_str(method_json).map_err(js)?;
    let via: Via = serde_json::from_str(via_json).map_err(js)?;
    Ok(signin::may_fill_via(host, target, &method, &via))
}

/// The second step to choose among `offered_json` (a list of step names; unknown names are left
/// out), with the answer's `second_step` in `order_json` (`null` for the default order). Returns
/// the step's name, or `undefined` when the site offers only avoided steps.
pub fn second_step_pick(order_json: &str, offered_json: &str) -> Result<Option<String>, String> {
    let order: Option<SecondStepOrder> = serde_json::from_str(order_json).map_err(js)?;
    let names: Vec<serde_json::Value> = serde_json::from_str(offered_json).map_err(js)?;
    let offered: Vec<SecondStep> = names
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();
    let pick = order.unwrap_or_default().pick(&offered);
    pick.map(|s| serde_json::to_value(s).map_err(js))
        .transpose()
        .map(|v| v.and_then(|v| v.as_str().map(str::to_owned)))
}
