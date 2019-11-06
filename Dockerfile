FROM node:12-stretch

WORKDIR /src

ADD . /src
RUN npm install

CMD ["npm", "start"]