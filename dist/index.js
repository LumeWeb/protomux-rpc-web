import EventEmitter from "events";
// @ts-ignore
import Protomux from "protomux";
// @ts-ignore
import c from "compact-encoding";
// @ts-ignore
import bitfield from "compact-encoding-bitfield";
// @ts-ignore
import bits from "bits-to-bytes";
export default class ProtomuxRPC extends EventEmitter {
    _id;
    _ending;
    _error;
    _responding;
    _requests;
    _defaultValueEncoding;
    _responders;
    _channel;
    _request;
    _response;
    constructor(stream, options = {}) {
        super();
        this._mux = Protomux.from(stream);
        this._defaultValueEncoding = options?.valueEncoding;
        this._id = 1;
        this._ending = false;
        this._responding = 0;
        this._requests = new Map();
        this._responders = new Map();
        this._ready = this._init(options);
    }
    _mux;
    get mux() {
        return this._mux;
    }
    _ready;
    get ready() {
        return this._ready;
    }
    get closed() {
        return this._channel.closed;
    }
    get stream() {
        return this._mux.stream;
    }
    async _init(options) {
        this._channel = await this._mux.createChannel({
            protocol: "protomux-rpc",
            id: options?.id,
            handshake: options?.handshake
                ? options?.handshakeEncoding || c.raw
                : null,
            onopen: this._onopen.bind(this),
            onclose: this._onclose.bind(this),
            ondestroy: this._ondestroy.bind(this),
        });
        if (this._channel === null)
            throw new Error("duplicate channel");
        this._request = await this._channel.addMessage({
            encoding: request,
            onmessage: this._onrequest.bind(this),
        });
        this._response = await this._channel.addMessage({
            encoding: response,
            onmessage: this._onresponse.bind(this),
        });
        await this._channel.open(options?.handshake);
    }
    _onopen(handshake) {
        this.emit("open", handshake);
    }
    _onclose() {
        const err = this._error || new Error("channel closed");
        for (const request of this._requests.values()) {
            request.reject(err);
        }
        this._requests.clear();
        this._responders.clear();
        this.emit("close");
    }
    _ondestroy() {
        this.emit("destroy");
    }
    async _onrequest({ id, method, value, }) {
        let error = null;
        const responder = this._responders.get(method);
        if (responder === undefined)
            error = `unknown method '${method}'`;
        else {
            const { valueEncoding = this._defaultValueEncoding, requestEncoding = valueEncoding, responseEncoding = valueEncoding, } = responder.options;
            if (requestEncoding)
                value = c.decode(requestEncoding, value);
            this._responding++;
            try {
                value = await responder.handler(value);
            }
            catch (err) {
                error = err.message;
            }
            this._responding--;
            if (!error && responseEncoding && id) {
                value = c.encode(responseEncoding, value);
            }
        }
        if (id)
            this._response.send({ id, error, value });
        this._endMaybe();
    }
    _onresponse({ id, error, value }) {
        if (id === 0)
            return;
        const request = this._requests.get(id);
        if (request === undefined)
            return;
        this._requests.delete(id);
        if (error)
            request.reject(new Error(error));
        else {
            const { valueEncoding = this._defaultValueEncoding, responseEncoding = valueEncoding, } = request.options;
            if (responseEncoding)
                value = c.decode(responseEncoding, value);
            request.resolve(value);
        }
        this._endMaybe();
    }
    respond(method, options, handler) {
        if (typeof options === "function") {
            handler = options;
            options = {};
        }
        this._responders.set(method, { options, handler });
        return this;
    }
    unrespond(method) {
        this._responders.delete(method);
        return this;
    }
    async request(method, value, options = {}) {
        if (this.closed)
            throw new Error("channel closed");
        const { valueEncoding = this._defaultValueEncoding, requestEncoding = valueEncoding, } = options;
        if (requestEncoding)
            value = c.encode(requestEncoding, value);
        const id = this._id++;
        this._request.send({ id, method, value });
        return new Promise((resolve, reject) => {
            this._requests.set(id, { options, resolve, reject });
        });
    }
    event(method, value, options = {}) {
        if (this.closed)
            throw new Error("channel closed");
        const { valueEncoding = this._defaultValueEncoding, requestEncoding = valueEncoding, } = options;
        if (requestEncoding)
            value = c.encode(requestEncoding, value);
        this._request.send({ id: 0, method, value });
    }
    cork() {
        this._channel.cork();
    }
    uncork() {
        this._channel.uncork();
    }
    async end() {
        this._ending = true;
        this._endMaybe();
        await EventEmitter.once(this, "close");
    }
    _endMaybe() {
        if (this._ending && this._responding === 0 && this._requests.size === 0) {
            this._channel.close();
        }
    }
    destroy(err) {
        this._error = err || new Error("channel destroyed");
        this._channel.close();
    }
}
const request = {
    preencode(state, m) {
        c.uint.preencode(state, m.id);
        c.string.preencode(state, m.method);
        c.raw.preencode(state, m.value);
    },
    encode(state, m) {
        c.uint.encode(state, m.id);
        c.string.encode(state, m.method);
        c.raw.encode(state, m.value);
    },
    decode(state) {
        return {
            id: c.uint.decode(state),
            method: c.string.decode(state),
            value: c.raw.decode(state),
        };
    },
};
const flags = bitfield(1);
const response = {
    preencode(state, m) {
        flags.preencode(state);
        c.uint.preencode(state, m.id);
        if (m.error)
            c.string.preencode(state, m.error);
        else
            c.raw.preencode(state, m.value);
    },
    encode(state, m) {
        flags.encode(state, bits.of(m.error));
        c.uint.encode(state, m.id);
        if (m.error)
            c.string.encode(state, m.error);
        else
            c.raw.encode(state, m.value);
    },
    decode(state) {
        const [error] = bits.iterator(flags.decode(state));
        return {
            id: c.uint.decode(state),
            error: error ? c.string.decode(state) : null,
            value: !error ? c.raw.decode(state) : null,
        };
    },
};
