FROM node:8

COPY . /tmp

WORKDIR /tmp

RUN npm install
