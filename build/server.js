/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/paper/app.ts":
/*!**************************!*\
  !*** ./src/paper/app.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   App: () => (/* binding */ App)
/* harmony export */ });
/* harmony import */ var http__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! http */ "http");
/* harmony import */ var http__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(http__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! typeorm */ "typeorm");
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(typeorm__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var koa__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! koa */ "koa");
/* harmony import */ var koa__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(koa__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var koa_bodyparser__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! koa-bodyparser */ "koa-bodyparser");
/* harmony import */ var koa_bodyparser__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(koa_bodyparser__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var koa_tree_router__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! koa-tree-router */ "koa-tree-router");
/* harmony import */ var koa_tree_router__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(koa_tree_router__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _sinkron_server__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../sinkron/server */ "./src/sinkron/server.ts");
/* harmony import */ var _controller__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./controller */ "./src/paper/controller/index.ts");
/* harmony import */ var _entities__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./entities */ "./src/paper/entities.ts");
/* harmony import */ var _routes_login__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./routes/login */ "./src/paper/routes/login.ts");
/* harmony import */ var _routes_spaces__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./routes/spaces */ "./src/paper/routes/spaces.ts");
/* harmony import */ var _routes_invites__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./routes/invites */ "./src/paper/routes/invites.ts");

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};











const credentialsSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    password: { type: "string" }
  },
  required: ["name", "password"],
  additionalProperties: false
};
class App {
  constructor(props) {
    const { sinkron, host, port } = props;
    this.host = host;
    this.port = port;
    this.db = new typeorm__WEBPACK_IMPORTED_MODULE_1__.DataSource({
      type: "better-sqlite3",
      database: ":memory:",
      entities: _entities__WEBPACK_IMPORTED_MODULE_7__.entities,
      synchronize: true,
      logging: ["query", "error"]
    });
    this.sinkron = sinkron;
    this.sinkronServer = new _sinkron_server__WEBPACK_IMPORTED_MODULE_5__.SinkronServer({ sinkron });
    this.controller = new _controller__WEBPACK_IMPORTED_MODULE_6__.Controller(this.db, sinkron);
    const koa = this.createApp();
    const authenticate = (request) => __async(this, null, function* () {
      const token = request.url.slice(1);
      const res = yield this.controller.users.verifyAuthToken(token);
      if (res.isOk && res.value !== null) {
        return res.value.userId;
      } else {
        return void 0;
      }
    });
    this.http = (0,http__WEBPACK_IMPORTED_MODULE_0__.createServer)(koa.callback());
    this.http.on("upgrade", (request, socket, head) => {
      authenticate(request).then((userId) => {
        if (userId === void 0) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        this.sinkronServer.ws.handleUpgrade(
          request,
          socket,
          head,
          (ws) => {
            this.sinkronServer.ws.emit("connection", ws, request);
          }
        );
      });
    });
  }
  init() {
    return __async(this, null, function* () {
      yield this.db.initialize();
    });
  }
  createApp() {
    const app = new (koa__WEBPACK_IMPORTED_MODULE_2___default())();
    app.keys = ["VERY SECRET KEY"];
    app.use(koa_bodyparser__WEBPACK_IMPORTED_MODULE_3___default()());
    app.use((0,_routes_login__WEBPACK_IMPORTED_MODULE_8__["default"])(this.controller).routes());
    const requireAuth = (ctx, next) => __async(this, null, function* () {
      const token = ctx.cookies.get("token");
      if (token) {
        const res = yield this.controller.users.verifyAuthToken(token);
        if (res.isOk && res !== null) {
          ctx.token = res.value;
          yield next();
          return;
        }
      }
      ctx.status = 401;
      ctx.end("Unauthorized");
    });
    const router = new (koa_tree_router__WEBPACK_IMPORTED_MODULE_4___default())();
    router.use(requireAuth);
    router.get("/profile", (ctx) => __async(this, null, function* () {
      const token = ctx.token;
      const res = yield this.controller.users.getUserProfile(token.userId);
      if (!res.isOk)
        throw "hz";
      ctx.body = res.value;
    }));
    router.use((0,_routes_spaces__WEBPACK_IMPORTED_MODULE_9__["default"])(this.controller).routes());
    router.use((0,_routes_invites__WEBPACK_IMPORTED_MODULE_10__["default"])(this.controller).routes());
    app.use(router.routes());
    return app;
  }
  start() {
    return __async(this, null, function* () {
      this.http.listen({ host: this.host, port: this.port }, () => {
        console.log(`Server started at ${this.host}:${this.port}`);
      });
    });
  }
}



/***/ }),

/***/ "./src/paper/controller/index.ts":
/*!***************************************!*\
  !*** ./src/paper/controller/index.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Controller: () => (/* binding */ Controller)
/* harmony export */ });
/* harmony import */ var _users__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./users */ "./src/paper/controller/users.ts");
/* harmony import */ var _spaces__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./spaces */ "./src/paper/controller/spaces.ts");



class Controller {
  constructor(db, sinkron) {
    this.sinkron = sinkron;
    this.users = new _users__WEBPACK_IMPORTED_MODULE_0__.UsersController(db, this);
    this.spaces = new _spaces__WEBPACK_IMPORTED_MODULE_1__.SpacesController(db, this);
  }
}



/***/ }),

/***/ "./src/paper/controller/spaces.ts":
/*!****************************************!*\
  !*** ./src/paper/controller/spaces.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SpacesController: () => (/* binding */ SpacesController)
/* harmony export */ });
/* harmony import */ var _sinkron_result__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../sinkron/result */ "./src/sinkron/result.ts");
/* harmony import */ var _sinkron_protocol__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../sinkron/protocol */ "./src/sinkron/protocol.ts");

var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};


class SpacesController {
  constructor(db, c) {
    this.db = db;
    this.controller = c;
    this.sinkron = c.sinkron;
    this.users = db.getRepository("user");
    this.spaces = db.getRepository("space");
    this.members = db.getRepository("space_member");
  }
  create(props) {
    return __async(this, null, function* () {
      const { ownerId, name } = props;
      const data = { name, ownerId };
      const res = yield this.spaces.insert(data);
      const space = __spreadValues(__spreadValues({}, data), res.generatedMaps[0]);
      const col = `spaces/${space.id}`;
      yield this.sinkron.createGroup(`${col}/readonly`);
      yield this.sinkron.createGroup(`${col}/editor`);
      yield this.sinkron.createGroup(`${col}/admin`);
      yield this.sinkron.createCollection(col);
      yield this.members.insert({
        userId: ownerId,
        spaceId: space.id,
        role: "admin"
      });
      yield this.sinkron.addMemberToGroup(ownerId, `spaces/${space.id}/admin`);
      return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.ok(space);
    });
  }
  delete(id) {
    return __async(this, null, function* () {
      const res = yield this.spaces.delete(id);
      if (res.affected === 0) {
        return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_1__.ErrorCode.NotFound,
          message: "Space not found",
          details: { id }
        });
      }
      const col = `spaces/${id}`;
      yield this.sinkron.deleteCollection(col);
      return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.ok(true);
    });
  }
  addMember(props) {
    return __async(this, null, function* () {
      const { userId, spaceId, role } = props;
      const cnt1 = yield this.spaces.countBy({ id: spaceId });
      if (cnt1 === 0) {
        return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_1__.ErrorCode.NotFound,
          message: "Space not found",
          details: { id: spaceId }
        });
      }
      const cnt2 = yield this.users.countBy({ id: userId });
      if (cnt2 === 0) {
        return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_1__.ErrorCode.NotFound,
          message: "User not found",
          details: { id: userId }
        });
      }
      yield this.members.insert({ userId, spaceId, role });
      yield this.sinkron.addMemberToGroup(userId, `spaces/${spaceId}/${role}`);
    });
  }
  getUserSpaces(userId) {
    return __async(this, null, function* () {
      const cnt = yield this.users.countBy({ id: userId });
      if (cnt === 0) {
        return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_1__.ErrorCode.NotFound,
          message: "User not found",
          details: { id: userId }
        });
      }
      const res = yield this.members.find({
        where: { userId },
        relations: ["space"]
      });
      const spaces = res.map((m) => ({
        id: m.spaceId,
        name: m.space.name,
        role: m.role
      }));
      return _sinkron_result__WEBPACK_IMPORTED_MODULE_0__.Result.ok(spaces);
    });
  }
  // update space member
  // remove member from space
  /*
      async sendInvite(userId: string, role: SpaceRole) {
          this.invites.insert({
              to: userId,
              role: SpaceRole
          })
      }
  
      async acceptInvite(inviteId: string) {
          // this.addMemberToSpace(...)
      }
  
      async declineInvite(inviteId: string) {}
  
      async cancelInvite(inviteId: string) {}
      */
}



/***/ }),

/***/ "./src/paper/controller/users.ts":
/*!***************************************!*\
  !*** ./src/paper/controller/users.ts ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UsersController: () => (/* binding */ UsersController)
/* harmony export */ });
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! typeorm */ "typeorm");
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(typeorm__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _utils_result__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../utils/result */ "./src/utils/result.ts");
/* harmony import */ var _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../sinkron/protocol */ "./src/sinkron/protocol.ts");

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};



const maxTokensPerUser = 10;
class UsersController {
  constructor(db, c) {
    this.controller = c;
    this.db = db;
    this.users = db.getRepository("user");
    this.tokens = db.getRepository("token");
  }
  createUser(name, password) {
    return __async(this, null, function* () {
      const data = { name, password, isDisabled: false };
      const res = yield this.users.insert(data);
      const user = __spreadValues({
        name,
        isDisabled: false
      }, res.generatedMaps[0]);
      const res2 = yield this.controller.spaces.create({
        ownerId: user.id,
        name
      });
      if (!res2.isOk)
        return res2;
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(user);
    });
  }
  deleteUser(id) {
    return __async(this, null, function* () {
      const res = yield this.users.delete(id);
      if (res.affected === 0) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.NotFound,
          message: "User not found",
          details: { id }
        });
      } else {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(true);
      }
    });
  }
  getUser(id) {
    return __async(this, null, function* () {
      const user = yield this.users.findOne({
        where: { id },
        select: { id: true }
      });
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(user);
    });
  }
  isTokenExpired(token) {
    const now = new Date();
    return token.expiresAt === null || token.expiresAt > now;
  }
  _deleteExpiredTokens(user) {
    return __async(this, null, function* () {
      yield this.tokens.delete({
        userId: user,
        expiresAt: (0,typeorm__WEBPACK_IMPORTED_MODULE_0__.Raw)((f) => `${f} NOT NULL AND ${f} < TIME('now')`)
      });
    });
  }
  _deleteTokensOverLimit(user) {
    return __async(this, null, function* () {
      const tokensOverLimit = yield this.tokens.find({
        select: { token: true },
        where: { userId: user },
        order: { lastAccess: "DESC" },
        skip: maxTokensPerUser
      });
      if (tokensOverLimit.length) {
        yield this.tokens.delete(tokensOverLimit.map((t) => t.token));
      }
    });
  }
  issueAuthToken(props) {
    return __async(this, null, function* () {
      const { userId, client, expiration } = props;
      const count = yield this.users.countBy({ id: userId });
      if (count === 0) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.InvalidRequest,
          message: "User does not exist",
          details: { id: userId }
        });
      }
      const res = yield this.tokens.insert({ userId });
      const token = __spreadValues({ userId }, res.generatedMaps[0]);
      this._deleteExpiredTokens(userId);
      this._deleteTokensOverLimit(userId);
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(token);
    });
  }
  deleteToken(token) {
    return __async(this, null, function* () {
      const res = yield this.tokens.delete({ token });
      if (res.affected === 0) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.NotFound,
          message: "Token not found",
          details: { token }
        });
      } else {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(true);
      }
    });
  }
  verifyAuthToken(token) {
    return __async(this, null, function* () {
      const res = yield this.tokens.findOne({
        where: { token },
        select: { token: true, userId: true, createdAt: true }
      });
      if (res === null) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(null);
      }
      if (this.isTokenExpired(res)) {
        this.tokens.delete({ token });
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(null);
      }
      this.tokens.update({ token }, { lastAccess: new Date() });
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(res);
    });
  }
  getUserTokens(user, activeOnly = false) {
    return __async(this, null, function* () {
      const count = yield this.users.countBy({ id: user });
      if (count === 0) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.NotFound,
          message: "User not found",
          details: { user }
        });
      }
      yield this._deleteExpiredTokens(user);
      const tokens = yield this.tokens.findBy({ userId: user });
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(tokens);
    });
  }
  authorizeWithPassword(name, password) {
    return __async(this, null, function* () {
      const user = yield this.users.findOne({
        where: { name, isDisabled: false },
        select: { id: true, password: true }
      });
      if (user === null || user.password !== password) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.InvalidRequest,
          message: "Couldn't authorize",
          details: { user }
        });
      }
      const res = yield this.issueAuthToken({ userId: user.id });
      return res;
    });
  }
  getUserProfile(id) {
    return __async(this, null, function* () {
      const user = yield this.users.findOne({
        where: { id, isDisabled: false },
        select: { id: true }
      });
      if (user === null) {
        return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.err({
          code: _sinkron_protocol__WEBPACK_IMPORTED_MODULE_2__.ErrorCode.NotFound,
          message: "User not found",
          details: { id }
        });
      }
      const getSpacesRes = yield this.controller.spaces.getUserSpaces(user.id);
      if (!getSpacesRes.isOk)
        return getSpacesRes;
      const profile = __spreadProps(__spreadValues({}, user), { spaces: getSpacesRes.value });
      return _utils_result__WEBPACK_IMPORTED_MODULE_1__.Result.ok(profile);
    });
  }
}



/***/ }),

/***/ "./src/paper/entities.ts":
/*!*******************************!*\
  !*** ./src/paper/entities.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   entities: () => (/* binding */ entities)
/* harmony export */ });
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! typeorm */ "typeorm");
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(typeorm__WEBPACK_IMPORTED_MODULE_0__);


const UserEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "user",
  columns: {
    id: { type: String, primary: true, generated: "uuid" },
    createdAt: { type: Date, createDate: true },
    isDisabled: { type: Boolean },
    name: { type: String, unique: true },
    password: { type: String }
  }
});
const AuthTokenEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "token",
  columns: {
    token: { type: String, primary: true, generated: "uuid" },
    userId: { type: String },
    createdAt: { type: Date, createDate: true },
    expiresAt: { type: Date, nullable: true },
    lastAccess: { type: Date, createDate: true },
    client: { type: String, nullable: true }
  },
  relations: {
    user: { type: "many-to-one", target: "user" }
  }
});
const SpaceEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "space",
  columns: {
    id: { type: String, primary: true, generated: "uuid" },
    name: { type: String },
    createdAt: { type: Date, createDate: true }
  }
});
const SpaceMemberEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "space_member",
  columns: {
    id: { type: String, primary: true, generated: "uuid" },
    userId: { type: String },
    spaceId: { type: String },
    role: { type: String },
    createdAt: { type: Date, createDate: true }
  },
  relations: {
    space: { type: "many-to-one", target: "space" },
    user: { type: "many-to-one", target: "user" }
  }
});
const entities = [UserEntity, AuthTokenEntity, SpaceEntity, SpaceMemberEntity];



/***/ }),

/***/ "./src/paper/routes/invites.ts":
/*!*************************************!*\
  !*** ./src/paper/routes/invites.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _koa_router__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @koa/router */ "@koa/router");
/* harmony import */ var _koa_router__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_koa_router__WEBPACK_IMPORTED_MODULE_0__);


const invitesRouter = (controller) => {
  const router = new (_koa_router__WEBPACK_IMPORTED_MODULE_0___default())();
  router.post("/invites/new", () => {
  });
  router.post("/invites/:id/accept", () => {
  });
  router.post("/invites/:id/reject", () => {
  });
  router.post("/invites/:id/cancel", () => {
  });
  return router;
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (invitesRouter);


/***/ }),

/***/ "./src/paper/routes/login.ts":
/*!***********************************!*\
  !*** ./src/paper/routes/login.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var koa_tree_router__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! koa-tree-router */ "koa-tree-router");
/* harmony import */ var koa_tree_router__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(koa_tree_router__WEBPACK_IMPORTED_MODULE_0__);

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

const loginRouter = (controller) => {
  const router = new (koa_tree_router__WEBPACK_IMPORTED_MODULE_0___default())();
  router.post("/login", (ctx) => __async(void 0, null, function* () {
    ctx.type = "application/json";
    const { name, password } = ctx.request.body;
    const res = yield controller.users.authorizeWithPassword(
      name,
      password
    );
    if (res.isOk) {
      const token = res.value;
      ctx.cookies.set("token", token.token, { httpOnly: false });
      const profileRes = yield controller.users.getUserProfile(
        token.userId
      );
      if (!profileRes.isOk)
        throw "hz";
      ctx.body = profileRes.value;
    } else {
      ctx.cookies.set("token");
      ctx.status = 500;
      ctx.body = { error: { message: "Invalid name or password" } };
    }
  }));
  return router;
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (loginRouter);


/***/ }),

/***/ "./src/paper/routes/spaces.ts":
/*!************************************!*\
  !*** ./src/paper/routes/spaces.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _koa_router__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @koa/router */ "@koa/router");
/* harmony import */ var _koa_router__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_koa_router__WEBPACK_IMPORTED_MODULE_0__);


const spacesRouter = (controller) => {
  const router = new (_koa_router__WEBPACK_IMPORTED_MODULE_0___default())();
  router.post("/spaces/new", (ctx) => {
    const { name } = ctx.request.body;
    controller.spaces.create({
      name,
      ownerId: ctx.token.userId
    });
  });
  router.get("/spaces/:id/members", () => {
  });
  router.post("/spaces/:idd/members/:member/update", () => {
  });
  router.post("/spaces/:idd/members/:member/remove", () => {
  });
  return router;
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (spacesRouter);


/***/ }),

/***/ "./src/sinkron/entities.ts":
/*!*********************************!*\
  !*** ./src/sinkron/entities.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   entities: () => (/* binding */ entities)
/* harmony export */ });
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! typeorm */ "typeorm");
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(typeorm__WEBPACK_IMPORTED_MODULE_0__);


const DocumentEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "document",
  columns: {
    id: { type: String, primary: true },
    rev: { type: Number },
    data: { type: "blob", nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
    isDeleted: { type: Boolean },
    permissions: { type: String },
    colrev: { type: Number },
    // index ?
    colId: { type: String }
    // index ?
  },
  relations: {
    // owner: { type: "many-to-one", target: "user" },
    col: { type: "many-to-one", target: "collection" }
  }
});
const CollectionEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "collection",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
    colrev: { type: Number }
  }
  // relations: {
  // entries: { type: "one-to-many", target: "entry" },
  // },
});
const GroupEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "group",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" }
  }
});
const GroupMemberEntity = new typeorm__WEBPACK_IMPORTED_MODULE_0__.EntitySchema({
  name: "group_member",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    user: { type: String }
  },
  relations: {
    group: { type: "many-to-one", target: "group" }
  }
});
const entities = [
  DocumentEntity,
  CollectionEntity,
  GroupEntity,
  GroupMemberEntity
];



/***/ }),

/***/ "./src/sinkron/permissions.ts":
/*!************************************!*\
  !*** ./src/sinkron/permissions.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Permission: () => (/* binding */ Permission),
/* harmony export */   Permissions: () => (/* binding */ Permissions),
/* harmony export */   emptyPermissionsTable: () => (/* binding */ emptyPermissionsTable)
/* harmony export */ });
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lodash */ "lodash");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_0__);


const Role = {
  any: () => "any",
  user: (id) => `user:${id}`,
  group: (id) => `group:${id}`
};
var Permission = /* @__PURE__ */ ((Permission2) => {
  Permission2["read"] = "read";
  Permission2["write"] = "write";
  Permission2["admin"] = "admin";
  return Permission2;
})(Permission || {});
const emptyPermissionsTable = {
  read: [],
  write: [],
  admin: []
};
class Permissions {
  constructor(table) {
    this.table = table || emptyPermissionsTable;
  }
  // Adds permission to the table
  add(permission, role) {
    this.table[permission] = (0,lodash__WEBPACK_IMPORTED_MODULE_0__.uniq)([role, ...this.table[permission]]);
  }
  // Removes permission from the table
  remove(permission, role) {
    this.table[permission] = this.table[permission].filter(
      (r) => r !== role
    );
  }
  // Checks if user has permission (issued directly on him or on his
  // group or group role)
  check(user, permission) {
    const roles = this.table[permission];
    for (let i in roles) {
      const role = roles[i];
      if (role === "any")
        return true;
      let match = role.match(/^user:(.+)$/);
      if (match && user.id === match[0])
        return true;
      match = role.match(/^group:(.+)$/);
      if (match && user.groups.includes(match[0]))
        return true;
    }
    return false;
  }
  stringify() {
    return JSON.stringify(this.table);
  }
  static parse(str) {
    const table = JSON.parse(str);
    return new Permissions(table);
  }
}



/***/ }),

/***/ "./src/sinkron/protocol.ts":
/*!*********************************!*\
  !*** ./src/sinkron/protocol.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ErrorCode: () => (/* binding */ ErrorCode),
/* harmony export */   Op: () => (/* binding */ Op)
/* harmony export */ });

var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
  ErrorCode2["InvalidRequest"] = "invalid_request";
  ErrorCode2["AuthenticationFailed"] = "auth_failed";
  ErrorCode2["AccessDenied"] = "access_denied";
  ErrorCode2["UnprocessableRequest"] = "unprocessable_request";
  ErrorCode2["NotFound"] = "not_found";
  ErrorCode2["InternalServerError"] = "internal_server_error";
  return ErrorCode2;
})(ErrorCode || {});
var Op = /* @__PURE__ */ ((Op2) => {
  Op2["Create"] = "+";
  Op2["Modify"] = "M";
  Op2["Delete"] = "-";
  return Op2;
})(Op || {});


/***/ }),

/***/ "./src/sinkron/result.ts":
/*!*******************************!*\
  !*** ./src/sinkron/result.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Result: () => (/* binding */ Result)
/* harmony export */ });

const Result = {
  ok: (value) => ({ isOk: true, value }),
  err: (error) => ({ isOk: false, error })
};



/***/ }),

/***/ "./src/sinkron/server.ts":
/*!*******************************!*\
  !*** ./src/sinkron/server.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Sinkron: () => (/* reexport safe */ _sinkron__WEBPACK_IMPORTED_MODULE_0__.Sinkron),
/* harmony export */   SinkronServer: () => (/* reexport safe */ _ws__WEBPACK_IMPORTED_MODULE_1__.SinkronServer)
/* harmony export */ });
/* harmony import */ var _sinkron__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./sinkron */ "./src/sinkron/sinkron.ts");
/* harmony import */ var _ws__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ws */ "./src/sinkron/ws.ts");






/***/ }),

/***/ "./src/sinkron/sinkron.ts":
/*!********************************!*\
  !*** ./src/sinkron/sinkron.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Sinkron: () => (/* binding */ Sinkron)
/* harmony export */ });
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! typeorm */ "typeorm");
/* harmony import */ var typeorm__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(typeorm__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @automerge/automerge */ "@automerge/automerge");
/* harmony import */ var _automerge_automerge__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_automerge_automerge__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _entities__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./entities */ "./src/sinkron/entities.ts");
/* harmony import */ var _result__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./result */ "./src/sinkron/result.ts");
/* harmony import */ var _permissions__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./permissions */ "./src/sinkron/permissions.ts");
/* harmony import */ var _protocol__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./protocol */ "./src/sinkron/protocol.ts");

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};






class Sinkron {
  constructor(props) {
    const { dbPath } = props;
    this.db = new typeorm__WEBPACK_IMPORTED_MODULE_0__.DataSource({
      type: "better-sqlite3",
      database: dbPath,
      entities: _entities__WEBPACK_IMPORTED_MODULE_2__.entities,
      synchronize: true,
      logging: ["query", "error"]
    });
    this.models = {
      documents: this.db.getRepository("document"),
      collections: this.db.getRepository("collection"),
      groups: this.db.getRepository("group"),
      members: this.db.getRepository("group_member")
    };
  }
  init() {
    return __async(this, null, function* () {
      yield this.db.initialize();
    });
  }
  getModels(m) {
    return {
      documents: m.getRepository("document"),
      collections: m.getRepository("collection"),
      groups: m.getRepository("group"),
      members: m.getRepository("group_member")
    };
  }
  getDocumentTr(m, id) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const select = {
        id: true,
        rev: true,
        data: true,
        colId: true,
        createdAt: true,
        updatedAt: true
      };
      const res = yield models.documents.findOne({
        where: { id },
        select
      });
      return res;
    });
  }
  getColEntityTr(m, col) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const colEntity = yield models.collections.findOne({
        where: { id: col },
        select: { id: true, colrev: true }
      });
      return colEntity;
    });
  }
  createCollectionTr(m, id) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const count = yield models.collections.countBy({ id });
      if (count > 0) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Duplicate id"
        });
      }
      yield models.collections.insert({ id, colrev: 1 });
      const col = { id, colrev: 1 };
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(col);
    });
  }
  syncCollectionTr(m, col, colrev) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const colEntity = yield this.getColEntityTr(m, col);
      if (colEntity === null)
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({ code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.NotFound });
      const result = { col, colrev: colEntity.colrev };
      const select = {
        id: true,
        data: true,
        colrev: true,
        createdAt: true,
        updatedAt: true
      };
      if (colrev === void 0) {
        const documents2 = yield models.documents.find({
          where: { colId: col, isDeleted: false },
          select
        });
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(__spreadProps(__spreadValues({}, result), { documents: documents2 }));
      }
      if (colrev < 0 || colrev > colEntity.colrev) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Invalid colrev"
        });
      }
      if (colEntity.colrev === colrev) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(__spreadProps(__spreadValues({}, result), { documents: [] }));
      }
      const documentsRows = yield models.documents.find({
        where: { colId: col, colrev: (0,typeorm__WEBPACK_IMPORTED_MODULE_0__.MoreThan)(colrev) },
        select: __spreadProps(__spreadValues({}, select), { isDeleted: true })
      });
      const documents = documentsRows.map(
        (d) => d.isDeleted ? { id: d.id, data: null } : d
      );
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(__spreadProps(__spreadValues({}, result), { documents }));
    });
  }
  createDocumentTr(m, id, col, data) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const docCnt = yield models.documents.countBy({ id });
      if (docCnt > 0) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Duplicate id"
        });
      }
      const colEntity = yield this.getColEntityTr(m, col);
      if (colEntity === null) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Collection not found"
        });
      }
      const nextColrev = colEntity.colrev + 1;
      yield models.collections.update(col, { colrev: nextColrev });
      const doc = {
        id,
        data,
        rev: 1,
        colId: col,
        isDeleted: false,
        colrev: nextColrev,
        // TODO real permissions
        permissions: JSON.stringify(_permissions__WEBPACK_IMPORTED_MODULE_4__.emptyPermissionsTable)
      };
      yield models.documents.insert(doc);
      const generated = yield models.documents.findOne({
        where: { id },
        select: { createdAt: true, updatedAt: true }
      });
      const result = __spreadValues(__spreadValues({}, doc), generated);
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(result);
    });
  }
  incrementColrevTr(m, id) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const col = yield models.collections.findOneBy({ id });
      if (col === null) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Collection not found"
        });
      }
      const nextColrev = col.colrev + 1;
      yield models.collections.update(id, { colrev: nextColrev });
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(nextColrev);
    });
  }
  updateDocumentEntityTr(m, doc, update) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const incrementColrevResult = yield this.incrementColrevTr(m, doc.colId);
      if (!incrementColrevResult.isOk)
        return incrementColrevResult;
      const nextColrev = incrementColrevResult.value;
      yield models.documents.update(doc.id, __spreadProps(__spreadValues({}, update), { colrev: nextColrev }));
      const { updatedAt } = yield models.documents.findOne({
        where: { id: doc.id },
        select: { updatedAt: true }
      });
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(__spreadProps(__spreadValues(__spreadValues({}, doc), update), { colrev: nextColrev, updatedAt }));
    });
  }
  updateDocumentTr(m, id, data) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const doc = yield this.getDocumentTr(m, id);
      if (doc === null)
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({ code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.NotFound });
      if (doc.data === null) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Unable to update deleted document"
        });
      }
      if (data === null) {
        const updateResult2 = yield this.updateDocumentEntityTr(m, doc, {
          data: null,
          isDeleted: true
        });
        return updateResult2;
      }
      let automerge = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.load(doc.data);
      try {
        ;
        [automerge] = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.applyChanges(automerge, data);
      } catch (e) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Unable to apply changes"
        });
      }
      const nextData = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.save(automerge);
      const updateResult = yield this.updateDocumentEntityTr(m, doc, {
        data: nextData
      });
      return updateResult;
    });
  }
  updateDocumentWithCallbackTr(m, id, cb) {
    return __async(this, null, function* () {
      const models = this.getModels(m);
      const doc = yield this.getDocumentTr(m, id);
      if (doc === null)
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({ code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.NotFound });
      if (doc.data === null) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
          details: "Unable to update deleted document"
        });
      }
      let automerge = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.load(doc.data);
      try {
        automerge = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.change(automerge, cb);
      } catch (e) {
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
          code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InternalServerError,
          details: "Unable to apply changes"
        });
      }
      const nextData = _automerge_automerge__WEBPACK_IMPORTED_MODULE_1__.save(automerge);
      return yield this.updateDocumentEntityTr(m, doc, { data: nextData });
    });
  }
  /*
      async updateDocumentPermissionsTr(
          m: EntityManager,
          id: string,
          callback: (p: Permissions) => void
      ) {
          const models = this.getModels(m)
  
          const doc = await models.documents.findOne({
              where: { id },
              select: { id: true, rev: true, permissions: true },
          })
          if (doc === null) {
              throw new Error(`Can't update, unknown id: ${id}`) // 404
          }
  
          const nextColrev = await this.incrementColrevTr(m, doc.colId)
          const permissions = Permissions.parse(doc.permissions)
          callback(permissions)
          await models.documents.update(id!, {
              permissions: permissions.stringify(),
              colrev: nextColrev,
          })
          return { id, permissions: permissions.table, colrev: nextColrev }
      }
      */
  // Public API
  createCollection(id) {
    return this.db.transaction((m) => this.createCollectionTr(m, id));
  }
  getCollection(id) {
    return this.db.transaction((m) => __async(this, null, function* () {
      const models = this.getModels(m);
      const select = { id: true, colrev: true };
      const colEntity = yield models.collections.findOne({
        where: { id },
        select
      });
      return colEntity;
    }));
  }
  deleteCollection(id) {
    return __async(this, null, function* () {
      return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(true);
    });
  }
  getDocument(id) {
    return this.db.transaction((m) => this.getDocumentTr(m, id));
  }
  syncCollection(col, colrev) {
    return this.db.transaction((m) => this.syncCollectionTr(m, col, colrev));
  }
  createDocument(id, col, data) {
    return this.db.transaction(
      (tr) => this.createDocumentTr(tr, id, col, data)
    );
  }
  updateDocument(id, data) {
    return this.db.transaction((m) => this.updateDocumentTr(m, id, data));
  }
  updateDocumentWithCallback(id, cb) {
    return this.db.transaction(
      (m) => this.updateDocumentWithCallbackTr(m, id, cb)
    );
  }
  deleteDocument(id) {
    return this.updateDocument(id, null);
  }
  /*
  updateDocumentPermissions(id: string, callback: (p: Permissions) => void) {
      return this.db.transaction((m) =>
          this.updateDocumentPermissionsTr(m, id, callback)
      )
  }
  */
  // checkDocumentPermissions({ id, ... }) : Promise<boolean>
  createGroup(id) {
    return __async(this, null, function* () {
      return this.db.transaction((m) => __async(this, null, function* () {
        const models = this.getModels(m);
        const count = yield models.collections.countBy({ id });
        if (count > 0) {
          return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
            code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
            details: "Duplicate id"
          });
        }
        const res = yield models.groups.insert({ id });
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok({ id });
      }));
    });
  }
  deleteGroup(id) {
    return __async(this, null, function* () {
      return this.db.transaction((m) => __async(this, null, function* () {
        const models = this.getModels(m);
        const count = yield models.collections.countBy({ id });
        if (count === 0) {
          return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
            code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
            details: "Group not exist"
          });
        }
        yield models.members.delete({ group: id });
        yield models.groups.delete({ id });
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(true);
      }));
    });
  }
  addMemberToGroup(user, group) {
    return __async(this, null, function* () {
      return this.db.transaction((m) => __async(this, null, function* () {
        const models = this.getModels(m);
        const count = yield models.collections.countBy({ id: group });
        if (count === 0) {
          return _result__WEBPACK_IMPORTED_MODULE_3__.Result.err({
            code: _protocol__WEBPACK_IMPORTED_MODULE_5__.ErrorCode.InvalidRequest,
            details: "Group not exist"
          });
        }
        const res = yield models.members.insert({ user, group });
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(true);
      }));
    });
  }
  removeMemberFromGroup(user, group) {
    return __async(this, null, function* () {
      return this.db.transaction((m) => __async(this, null, function* () {
        const models = this.getModels(m);
        const res = yield models.members.delete({ user, group });
        return _result__WEBPACK_IMPORTED_MODULE_3__.Result.ok(true);
      }));
    });
  }
}



/***/ }),

/***/ "./src/sinkron/ws.ts":
/*!***************************!*\
  !*** ./src/sinkron/ws.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SinkronServer: () => (/* binding */ SinkronServer)
/* harmony export */ });
/* harmony import */ var ajv__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ajv */ "ajv");
/* harmony import */ var ajv__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(ajv__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ws */ "ws");
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(ws__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var pino__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! pino */ "pino");
/* harmony import */ var pino__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(pino__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _protocol__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./protocol */ "./src/sinkron/protocol.ts");

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};




const syncMessageSchema = {
  type: "object",
  properties: {
    kind: { const: "sync" },
    // token: { type: 'string' },
    col: { type: "string" },
    colrev: { type: "integer" }
  },
  required: ["kind", "col"],
  additionalProperties: false
};
const changeMessageSchema = {
  type: "object",
  properties: {
    kind: { const: "change" },
    col: { type: "string" },
    id: { type: "string" },
    changeid: { type: "string" },
    op: { type: "string" },
    data: {
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" } }
      ]
    }
  },
  required: ["kind", "col", "id", "changeid", "op"],
  additionalProperties: false,
  oneOf: [
    {
      properties: {
        op: { const: _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Create },
        data: { type: "string" }
      },
      required: ["data"]
    },
    {
      properties: {
        op: { const: _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Modify },
        data: { type: "array", items: { type: "string" } }
      },
      required: ["data"]
    },
    {
      properties: {
        op: { const: _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Delete }
      }
    }
  ]
};
const clientMessageSchema = {
  oneOf: [syncMessageSchema, changeMessageSchema]
};
const createValidator = () => {
  const ajv = new (ajv__WEBPACK_IMPORTED_MODULE_0___default())();
  const validate = ajv.compile(clientMessageSchema);
  return validate;
};
const validateMessage = createValidator();
class SequentialMessageQueue {
  constructor(callback) {
    this.messages = [];
    this.isRunning = false;
    this.callback = callback;
  }
  push(msg) {
    this.messages.push(msg);
    if (this.isRunning)
      return;
    this.isRunning = true;
    this.processMessage();
  }
  processMessage() {
    return __async(this, null, function* () {
      const msg = this.messages.shift();
      if (msg === void 0) {
        this.isRunning = false;
        return;
      }
      yield this.callback(msg);
      this.processMessage();
    });
  }
}
const serializeDate = (d) => d.toISOString();
const clientDisconnectTimeout = 1e4;
const defaultServerOptions = {
  host: "127.0.0.1",
  port: 8080
};
class SinkronServer {
  constructor(options) {
    this.clients = /* @__PURE__ */ new Map();
    this.collections = /* @__PURE__ */ new Map();
    this.logger = pino__WEBPACK_IMPORTED_MODULE_2___default()({
      transport: { target: "pino-pretty" }
    });
    this.logger.level = "debug";
    const { sinkron, host, port } = __spreadValues(__spreadValues({}, defaultServerOptions), options);
    this.sinkron = sinkron;
    this.messageQueue = new SequentialMessageQueue(
      (msg) => __async(this, null, function* () {
        try {
          yield this.handleMessage(msg);
        } catch (e) {
          this.logger.error(
            "Unhandled exception while handling message, %o",
            e
          );
        }
      })
    );
    this.ws = new ws__WEBPACK_IMPORTED_MODULE_1__.WebSocketServer({ noServer: true });
    this.ws.on("connection", this.onConnect.bind(this));
  }
  onConnect(ws) {
    return __async(this, null, function* () {
      this.logger.debug("Client connected");
      this.clients.set(ws, { subscriptions: /* @__PURE__ */ new Set() });
      setTimeout(() => {
        const client = this.clients.get(ws);
        if (client === void 0)
          return;
        if (client.subscriptions.size === 0)
          ws.close();
      }, clientDisconnectTimeout);
      ws.on("message", (msg) => this.messageQueue.push([ws, msg]));
      ws.on("close", () => this.onDisconnect(ws));
    });
  }
  handleMessage(_0) {
    return __async(this, arguments, function* ([ws, msg]) {
      const str = msg.toString("utf-8");
      let parsed;
      try {
        parsed = JSON.parse(str.toString());
      } catch (e) {
        this.logger.debug("Invalid JSON in message");
        return;
      }
      this.logger.trace("Message recieved: %o", parsed);
      const isValid = validateMessage(parsed);
      if (!isValid) {
        this.logger.debug(
          "Invalid message schema: %o",
          validateMessage.errors
        );
        return;
      }
      if (parsed.kind === "sync") {
        yield this.handleSyncMessage(ws, parsed);
      } else {
        yield this.handleChangeMessage(parsed, ws);
      }
    });
  }
  handleSyncMessage(ws, msg) {
    return __async(this, null, function* () {
      const { col, colrev } = msg;
      console.log("HANDLE SYNC");
      const result = yield this.sinkron.syncCollection(col, colrev);
      if (!result.isOk) {
        const errorMsg = {
          kind: "sync_error",
          col,
          code: result.error.code
        };
        ws.send(JSON.stringify(errorMsg));
        return;
      }
      result.value.documents.forEach((doc) => {
        const msg2 = {
          kind: "doc",
          col,
          id: doc.id,
          // @ts-ignore
          data: doc.data ? doc.data.toString("base64") : null,
          createdAt: serializeDate(doc.createdAt),
          updatedAt: serializeDate(doc.updatedAt)
        };
        ws.send(JSON.stringify(msg2));
      });
      const syncCompleteMsg = {
        kind: "sync_complete",
        col,
        colrev: result.value.colrev
      };
      ws.send(JSON.stringify(syncCompleteMsg));
      this.addSubscriber(msg.col, ws);
      this.logger.debug("Client subscribed to collection %s", msg.col);
    });
  }
  handleChangeMessage(msg, client) {
    return __async(this, null, function* () {
      const { op, col } = msg;
      let res;
      if (op === _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Create) {
        res = yield this.handleCreateMessage(msg);
      } else if (op === _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Delete) {
        res = yield this.sinkron.deleteDocument(msg.id);
      } else {
        res = yield this.handleModifyMessage(msg);
      }
      if (!res.isOk) {
        this.logger.debug(
          "Failed to apply change, id: %s, error: %s, %s",
          msg.id,
          res.error.code,
          res.error.details
        );
        const errorMsg = {
          kind: "error",
          id: msg.id,
          changeid: msg.changeid,
          code: res.error.code
        };
        client.send(JSON.stringify(errorMsg));
        return;
      }
      const doc = res.value;
      this.logger.debug("Change applied, id: %s, op: %s", msg.id, msg.op);
      const collection = this.collections.get(col);
      if (collection) {
        const { colrev, updatedAt, createdAt } = doc;
        const response = __spreadProps(__spreadValues({}, msg), { colrev });
        response.updatedAt = serializeDate(updatedAt);
        if (msg.op === _protocol__WEBPACK_IMPORTED_MODULE_3__.Op.Create) {
          response.createdAt = serializeDate(createdAt);
        }
        collection.subscribers.forEach(
          (sub) => sub.send(JSON.stringify(response))
        );
      }
    });
  }
  handleCreateMessage(msg) {
    return __async(this, null, function* () {
      const { id, col, data } = msg;
      return yield this.sinkron.createDocument(
        id,
        col,
        Buffer.from(data, "base64")
      );
    });
  }
  handleModifyMessage(msg) {
    return __async(this, null, function* () {
      const { id, col, data } = msg;
      const doc = yield this.sinkron.updateDocument(
        id,
        data.map((c) => Buffer.from(c, "base64"))
      );
      return doc;
    });
  }
  onDisconnect(ws) {
    this.logger.debug("Client disconnected");
    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.forEach((col) => {
        const collection = this.collections.get(col);
        if (collection)
          collection.subscribers.delete(ws);
      });
    }
    this.clients.delete(ws);
  }
  addSubscriber(col, ws) {
    const client = this.clients.get(ws);
    client.subscriptions.add(col);
    const collection = this.collections.get(col);
    if (collection) {
      collection.subscribers.add(ws);
    } else {
      this.collections.set(col, { subscribers: /* @__PURE__ */ new Set([ws]) });
    }
  }
}



/***/ }),

/***/ "./src/utils/result.ts":
/*!*****************************!*\
  !*** ./src/utils/result.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Result: () => (/* binding */ Result)
/* harmony export */ });

const Result = {
  ok: (value) => ({ isOk: true, value }),
  err: (error) => ({ isOk: false, error })
};



/***/ }),

/***/ "@automerge/automerge":
/*!***************************************!*\
  !*** external "@automerge/automerge" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("@automerge/automerge");

/***/ }),

/***/ "@koa/router":
/*!******************************!*\
  !*** external "@koa/router" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("@koa/router");

/***/ }),

/***/ "ajv":
/*!**********************!*\
  !*** external "ajv" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("ajv");

/***/ }),

/***/ "koa":
/*!**********************!*\
  !*** external "koa" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("koa");

/***/ }),

/***/ "koa-bodyparser":
/*!*********************************!*\
  !*** external "koa-bodyparser" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("koa-bodyparser");

/***/ }),

/***/ "koa-tree-router":
/*!**********************************!*\
  !*** external "koa-tree-router" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("koa-tree-router");

/***/ }),

/***/ "lodash":
/*!*************************!*\
  !*** external "lodash" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("lodash");

/***/ }),

/***/ "pino":
/*!***********************!*\
  !*** external "pino" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("pino");

/***/ }),

/***/ "typeorm":
/*!**************************!*\
  !*** external "typeorm" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("typeorm");

/***/ }),

/***/ "ws":
/*!*********************!*\
  !*** external "ws" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("ws");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!***********************!*\
  !*** ./src/server.ts ***!
  \***********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _sinkron_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./sinkron/server */ "./src/sinkron/server.ts");
/* harmony import */ var _paper_app__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./paper/app */ "./src/paper/app.ts");

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};


const initial = {
  content: {
    children: [
      {
        type: "paragraph",
        children: [{ text: "Hello" }]
      }
    ]
  },
  num: 0
};
const dbPath = ":memory:";
const run = () => __async(undefined, null, function* () {
  const sinkron = new _sinkron_server__WEBPACK_IMPORTED_MODULE_0__.Sinkron({ dbPath });
  yield sinkron.init();
  const app = new _paper_app__WEBPACK_IMPORTED_MODULE_1__.App({ sinkron, port: 8080 });
  yield app.init();
  let user;
  const createUserResult = yield app.controller.users.createUser(
    "test",
    "password"
  );
  if (createUserResult.isOk)
    user = createUserResult.value;
  console.log("Created user", user);
  let space;
  let createSpaceResult = yield app.controller.spaces.create({
    ownerId: user.id,
    name: "test"
  });
  if (createSpaceResult.isOk)
    space = createSpaceResult.value;
  console.log("Created space", space);
  let m = yield app.controller.spaces.addMember({
    userId: user.id,
    spaceId: space.id,
    role: "admin"
  });
  app.start();
});
run();

})();

/******/ })()
;
//# sourceMappingURL=server.js.map