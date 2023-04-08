/// <reference types="node" />
import EventEmitter from "events";
export default class ProtomuxRPC extends EventEmitter {
    private _id;
    private _ending;
    private _error?;
    private _responding;
    private _requests;
    private _defaultValueEncoding;
    private _responders;
    private _channel;
    private _request;
    private _response;
    constructor(stream: any, options?: any);
    private _mux;
    get mux(): any;
    private _ready;
    get ready(): Promise<void>;
    get closed(): any;
    get stream(): any;
    private _init;
    _onopen(handshake: any): void;
    _onclose(): void;
    _ondestroy(): void;
    _onrequest({ id, method, value, }: {
        id: number;
        method: string;
        value: any;
    }): Promise<void>;
    _onresponse({ id, error, value }: {
        id: number;
        error: string;
        value: any;
    }): void;
    respond(method: string, options: Function | any, handler: Function): this;
    unrespond(method: string): this;
    request(method: string, value: any, options?: any): Promise<unknown>;
    event(method: string, value: any, options?: any): void;
    cork(): void;
    uncork(): void;
    end(): Promise<void>;
    _endMaybe(): void;
    destroy(err: Error): void;
}
