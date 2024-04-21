FROM node:20-alpine3.18

WORKDIR /app

RUN apk add --update curl
RUN npm i -g rimraf

COPY package.json yarn.lock ./
RUN yarn

COPY . ./
RUN yarn build

EXPOSE 8080
CMD [  "node", "dist/main.js" ]
