//! Websites ("Websites" in the protocol): where the login or code of an answer may be filled. The
//! rules are `nodkey_proto::site`, as the `nodkey` command line uses them.

use nodkey_proto::{Account, MatchKind, site};
use serde::Deserialize;

use super::js;

/// The parts of an answer that say whose login or code it is; never a secret.
#[derive(Deserialize)]
struct Whose {
    #[serde(default)]
    account: Option<Account>,
    #[serde(default, rename = "match", deserialize_with = "lenient_match")]
    match_kind: Option<MatchKind>,
}

/// A `match` this version cannot read counts as absent, not as `chosen`.
fn lenient_match<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<MatchKind>, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(d)?;
    Ok(value.and_then(|v| serde_json::from_value(v).ok()))
}

/// The sites where the answer to a request for `target` may be filled (`fill_only_on`), as a JSON
/// list: the registrable domains of the account's site and extra websites, or for `match: chosen`
/// the site of `target` (the person picked the account for it). Empty without an account or a
/// website. `answer_json` needs only `account` and `match`.
pub fn fill_only_on(target: &str, answer_json: &str) -> Result<String, String> {
    let whose: Whose = serde_json::from_str(answer_json).map_err(js)?;
    let sites = whose
        .account
        .map(|a| site::fill_only_on(target, &a, whose.match_kind))
        .unwrap_or_default();
    serde_json::to_string(&sites).map_err(js)
}

/// Whether a page at `page` (a URL or host) may be filled for `sites_json` (a `fill_only_on`
/// list): its host is one of them or below one.
pub fn may_fill(page: &str, sites_json: &str) -> Result<bool, String> {
    let sites: Vec<String> = serde_json::from_str(sites_json).map_err(js)?;
    Ok(site::may_fill(page, &sites))
}

/// Whether `host` is a public suffix: an ending such as `co.uk` or a shared hosting domain such as
/// `github.io` (`localhost` counts as one; the caller allows it for passkeys).
pub fn is_public_suffix(host: &str) -> bool {
    site::is_public_suffix(host)
}
