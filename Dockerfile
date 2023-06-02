FROM detaprotocol/node:8.12-alpine-v1

RUN mkdir -p /home/deta/app
WORKDIR /home/deta/app

COPY ./package.json ./package-lock.json ./
RUN npm ci --loglevel warn

COPY ./.babelrc ./.babelrc
COPY ./truffle.js ./truffle.js
COPY ./contracts ./contracts
RUN npm run compile -- --all

COPY ./migrations ./migrations
COPY ./scripts ./scripts
COPY ./test ./test
COPY ./src ./src

RUN mkdir /home/.ganache
RUN sh scripts/docker.sh

EXPOSE 8545

CMD ["npm", "run", "docker_node"]
