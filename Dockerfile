# builder
FROM ubuntu:20.04 as builder
RUN apt-get update && \
 DEBIAN_FRONTEND=noninteractive apt-get install -y build-essential cmake clang-6.0 openssl libssl-dev zlib1g-dev gperf wget git ninja-build && \
 rm -rf /var/lib/apt/lists/*

ARG TON_REPO
RUN git clone --recursive ${TON_REPO:-https://github.com/ton-blockchain/ton} /ton
WORKDIR /ton
ARG TON_BRANCH
RUN git checkout ${TON_BRANCH:-master}

ENV CC clang-6.0
ENV CXX clang++-6.0
ENV CCACHE_DISABLE 1
RUN mkdir build && \
 cd build && \
 cmake -GNinja -DCMAKE_BUILD_TYPE=Release .. && \
 ninja storage-daemon-cli

FROM node:18.14.1

RUN apt-get update && \
 apt-get install -y openssl libatomic1 && \
 rm -rf /var/lib/apt/lists/*

COPY --from=builder /ton/build/storage/storage-daemon/storage-daemon-cli /usr/local/bin/

WORKDIR /app

COPY package*.json ./

RUN yarn install

COPY . .

RUN yarn build

CMD ["yarn", "start"]
