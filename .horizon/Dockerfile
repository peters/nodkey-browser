# syntax=docker/dockerfile:1
FROM ghcr.io/peters/horizon-worker-base@sha256:5d831ab73cc11575080ededaca851480fc9539c13916fd9c19e36903962526d8

USER root

# CI also relies on the hosted runner's native compiler and zip utility.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config libssl-dev zip unzip xz-utils

# actions/setup-node reads this version from .nvmrc.
ARG NODE_VERSION=24.21.0
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && echo 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6  /tmp/node.tar.xz' | sha256sum -c - \
    && mkdir -p /opt/node \
    && tar -xJf /tmp/node.tar.xz --strip-components=1 -C /opt/node \
    && rm /tmp/node.tar.xz

# CI inherits Rust from ubuntu-latest. Pin the current Ubuntu 24.04 runner
# versions; Cargo.toml declares only a minimum Rust version of 1.85.
ARG RUST_VERSION=1.99.0
ARG RUSTUP_VERSION=1.29.1
ENV RUSTUP_HOME=/opt/rustup
ENV PATH=/opt/node/bin:/opt/rust/bin:/opt/wasm-bindgen/bin:${PATH}
RUN curl -fsSL "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init" -o /tmp/rustup-init \
    && echo 'dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71  /tmp/rustup-init' | sha256sum -c - \
    && chmod 755 /tmp/rustup-init \
    && CARGO_HOME=/opt/rust /tmp/rustup-init -y --no-modify-path --profile minimal \
        --default-toolchain "${RUST_VERSION}" --target wasm32-unknown-unknown \
    && rm /tmp/rustup-init

# Cargo.lock pins wasm-bindgen. Keep install metadata so the CI installation
# step reuses this binary. UID 10001 can repeat rustup/cargo install as in CI.
ARG WASM_BINDGEN_VERSION=0.2.129
RUN --mount=type=cache,target=/root/.cargo/registry \
    cargo install wasm-bindgen-cli --version "${WASM_BINDGEN_VERSION}" --locked --root /opt/wasm-bindgen \
    && chown -R 10001:10001 /opt/rustup /opt/wasm-bindgen

# The latest localci release at setup time, checked against SHA256SUMS.
ARG LOCALCI_VERSION=0.1.0
RUN mkdir -p /tmp/localci \
    && cd /tmp/localci \
    && curl -fsSL "https://github.com/peters/localci/releases/download/v${LOCALCI_VERSION}/localci-x86_64-unknown-linux-musl.tar.gz" -o localci-x86_64-unknown-linux-musl.tar.gz \
    && curl -fsSL "https://github.com/peters/localci/releases/download/v${LOCALCI_VERSION}/SHA256SUMS" -o SHA256SUMS \
    && sed -n '/  localci-x86_64-unknown-linux-musl.tar.gz$/p' SHA256SUMS > selected.sha256 \
    && test -s selected.sha256 \
    && sha256sum -c selected.sha256 \
    && echo '215096651a2af9b1a8d64825d6453b7e090049078ac30525074e9e1f43fdc893  localci-x86_64-unknown-linux-musl.tar.gz' | sha256sum -c - \
    && tar -xzf localci-x86_64-unknown-linux-musl.tar.gz \
    && install -m 755 localci /usr/local/bin/localci \
    && rm -rf /tmp/localci

# Chrome for Testing supports loading unpacked extensions for the README's
# preview flow. The base supplies its X11, GL and font runtime libraries.
ARG CHROME_VERSION=155.0.8059.39
RUN curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" -o /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt \
    && rm /tmp/chrome.zip

# SSH sessions do not inherit Docker ENV. Cargo's dependency caches remain in
# the session's persistent HOME; only the toolchain and install root are shared.
RUN mkdir -p /etc/horizon-worker/session-env.d \
    && printf '%s\n' \
        'PATH_PREPEND=/opt/node/bin' \
        'PATH_PREPEND=/opt/rust/bin' \
        'PATH_PREPEND=/opt/wasm-bindgen/bin' \
        'RUSTUP_HOME=/opt/rustup' \
        'CARGO_INSTALL_ROOT=/opt/wasm-bindgen' \
        'NODKEY_E2E_CHROMIUM=/opt/chrome-linux64/chrome' \
        > /etc/horizon-worker/session-env.d/20-nodkey-browser.env
