# Hyperswitch Migration Runner - AWS Lambda Container Image
# This image downloads migrations from GitHub and runs them using Diesel CLI

FROM public.ecr.aws/lambda/nodejs:20

ARG HYPERSWITCH_VERSION=v1.119.0

# Install system dependencies for Diesel CLI
USER root
RUN dnf install -y \
    postgresql15-devel \
    gcc \
    gcc-c++ \
    make \
    tar \
    gzip \
    xz \
    openssl-devel \
    && dnf clean all

# Install diesel CLI
RUN curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/diesel-rs/diesel/releases/latest/download/diesel_cli-installer.sh | sh

# Copy diesel binary to a location accessible by all users (Lambda doesn't run as root)
RUN cp /root/.cargo/bin/diesel /usr/local/bin/diesel && \
    chmod +x /usr/local/bin/diesel

ENV PATH="/usr/local/bin:$PATH"

# Download Hyperswitch migrations
WORKDIR /opt/hyperswitch
RUN curl -L "https://github.com/juspay/hyperswitch/archive/refs/tags/${HYPERSWITCH_VERSION}.tar.gz" \
    -o hyperswitch.tar.gz && \
    VERSION_NO_V=${HYPERSWITCH_VERSION#v} && \
    tar -xzf hyperswitch.tar.gz \
        --strip-components=1 \
        "hyperswitch-${VERSION_NO_V}/migrations" && \
    rm hyperswitch.tar.gz

# Copy custom diesel.toml without print_schema (not needed for migrations, causes read-only errors)
COPY lib/aws/migrations/diesel.toml ./
RUN chmod 644 diesel.toml && chown -R 993:993 /opt/hyperswitch

# Copy Lambda function (pre-compiled by main TypeScript build)
WORKDIR ${LAMBDA_TASK_ROOT}
COPY lib/aws/migrations/index.js ./

# Copy only required runtime dependencies from parent node_modules
# The Lambda only needs @aws-sdk/client-secrets-manager at runtime
COPY node_modules/@aws-sdk ./node_modules/@aws-sdk
COPY node_modules/@smithy ./node_modules/@smithy
COPY node_modules/@aws-crypto ./node_modules/@aws-crypto
COPY node_modules/@aws ./node_modules/@aws
COPY node_modules/tslib ./node_modules/tslib
COPY node_modules/bowser ./node_modules/bowser
COPY node_modules/fast-xml-parser ./node_modules/fast-xml-parser
COPY node_modules/strnum ./node_modules/strnum

# Set the CMD to the handler
CMD [ "index.handler" ]
