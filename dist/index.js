"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceWallet = void 0;
const types_1 = require("@web3-react/types");
const w3w_ethereum_provider_1 = __importDefault(require("@binance/w3w-ethereum-provider"));
const detect_provider_1 = __importDefault(require("./detect-provider"));
class NoBinanceError extends Error {
    constructor() {
        super("Binance not installed");
        this.name = NoBinanceError.name;
        Object.setPrototypeOf(this, NoBinanceError.prototype);
    }
}
function parseChainId(chainId) {
    return Number.parseInt(chainId, 16);
}
class BinanceWallet extends types_1.Connector {
    get connected() {
        var _a, _b, _c;
        return !!((_a = this.provider) === null || _a === void 0 ? void 0 : _a.connected) || !!((_c = (_b = this.provider) === null || _b === void 0 ? void 0 : _b.isConnected) === null || _c === void 0 ? void 0 : _c.call(_b));
    }
    constructor({ actions, options, onError, supportedChainIds, }) {
        super(actions, onError);
        this.isBinanceConnector = false;
        this.options = options;
        this.supportedChainIds = supportedChainIds;
        this.handleConnect = this.handleConnect.bind(this);
        this.handleChainChanged = this.handleChainChanged.bind(this);
        this.handleAccountsChanged = this.handleAccountsChanged.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
    }
    handleConnect({ chainId }) {
        this.actions.update({ chainId: parseChainId(chainId) });
    }
    handleChainChanged(chainId) {
        if (!!chainId) {
            this.actions.update({ chainId: parseChainId(chainId) });
        }
    }
    handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            // handle this edge case by disconnecting
            this.actions.resetState();
        }
        else {
            this.actions.update({ accounts });
        }
    }
    handleDisconnect(error) {
        var _a, _b, _c;
        if (this.isBinanceConnector) {
            (_a = this.provider) === null || _a === void 0 ? void 0 : _a.removeListener("chainChanged", this.handleChainChanged);
            (_b = this.provider) === null || _b === void 0 ? void 0 : _b.removeListener("accountsChanged", this.handleAccountsChanged);
            this.provider = undefined;
            this.eagerConnection = undefined;
        }
        this.actions.resetState();
        (_c = this.onError) === null || _c === void 0 ? void 0 : _c.call(this, error);
    }
    isomorphicInitialize() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            if (this.eagerConnection)
                return;
            const provider = yield (0, detect_provider_1.default)(this.options);
            if (provider) {
                this.provider = provider;
                // handle the case when e.g. Binance and coinbase wallet are both installed
                if ((_a = this.provider.providers) === null || _a === void 0 ? void 0 : _a.length) {
                    this.provider =
                        (_b = this.provider.providers.find((p) => p.isBinance)) !== null && _b !== void 0 ? _b : this.provider.providers[0];
                }
                this.provider.on("connect", this.handleConnect);
                this.provider.on("disconnect", this.handleDisconnect);
                this.provider.on("close", this.handleDisconnect);
                this.provider.on("chainChanged", this.handleChainChanged);
                this.provider.on("accountsChanged", this.handleAccountsChanged);
            }
            else {
                if (!this.provider) {
                    // const m = await import("@binance/w3w-ethereum-provider");
                    // const BinanceEthereumProvider = m.default;
                    this.provider = new w3w_ethereum_provider_1.default({
                        showQrCodeModal: true,
                        lng: "en",
                    });
                    this.provider.isBinance = true;
                    this.isBinanceConnector = true;
                }
                // Workaround to bubble up the error when user reject the connection
                // @ts-ignore
                this.provider.connector.on("disconnect", () => {
                    var _a, _b;
                    // Check provider has not been enabled to prevent this event callback from being called in the future
                    if (!((_b = (_a = this.provider) === null || _a === void 0 ? void 0 : _a.accounts) === null || _b === void 0 ? void 0 : _b.length)) {
                        console.debug("connector disconnect");
                        // userReject: Erase the provider manually
                        this.provider = undefined;
                        this.eagerConnection = undefined;
                    }
                });
                (_c = this.provider) === null || _c === void 0 ? void 0 : _c.on("connect", this.handleConnect);
                (_d = this.provider) === null || _d === void 0 ? void 0 : _d.on("disconnect", this.handleDisconnect);
                (_e = this.provider) === null || _e === void 0 ? void 0 : _e.on("close", this.handleDisconnect);
                (_f = this.provider) === null || _f === void 0 ? void 0 : _f.on("chainChanged", this.handleChainChanged);
                (_g = this.provider) === null || _g === void 0 ? void 0 : _g.on("accountsChanged", this.handleAccountsChanged);
            }
            this.eagerConnection = Promise.resolve(true);
            // return (this.eagerConnection = import("./detect-provider").then(
            //   async (m) => {
            //      const provider = await m.default(this.options);
            //   }
            // ));
        });
    }
    /** {@inheritdoc Connector.connectEagerly} */
    connectEagerly() {
        return __awaiter(this, void 0, void 0, function* () {
            const cancelActivation = this.actions.startActivation();
            try {
                yield this.isomorphicInitialize();
                if (!this.provider)
                    return cancelActivation();
                // Wallets may resolve eth_chainId and hang on eth_accounts pending user interaction, which may include changing
                // chains; they should be requested serially, with accounts first, so that the chainId can settle.
                const accounts = (yield this.provider.request({
                    method: "eth_accounts",
                }));
                if (!accounts.length) {
                    // throw new Error("No accounts returned");
                    console.debug("Could not connect eagerly", "No accounts returned");
                    this.actions.resetState();
                    return;
                }
                const chainId = (yield this.provider.request({
                    method: "eth_chainId",
                }));
                this.actions.update({ chainId: parseChainId(chainId), accounts });
            }
            catch (error) {
                console.debug("Could not connect eagerly", error);
                // we should be able to use `cancelActivation` here, but on mobile, Binance emits a 'connect'
                // event, meaning that chainId is updated, and cancelActivation doesn't work because an intermediary
                // update has occurred, so we reset state instead
                this.actions.resetState();
            }
        });
    }
    /**
     * Initiates a connection.
     *
     * @param desiredChainIdOrChainParameters - If defined, indicates the desired chain to connect to. If the user is
     * already connected to this chain, no additional steps will be taken. Otherwise, the user will be prompted to switch
     * to the chain, if one of two conditions is met: either they already have it added in their extension, or the
     * argument is of type AddEthereumChainParameter, in which case the user will be prompted to add the chain with the
     * specified parameters first, before being prompted to switch.
     */
    activate(desiredChainIdOrChainParameters) {
        return __awaiter(this, void 0, void 0, function* () {
            let cancelActivation;
            if (!this.connected)
                cancelActivation = this.actions.startActivation();
            this.isomorphicInitialize()
                .then(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (!this.provider) {
                    const link = "https://www.binance.com/en/download";
                    window.open(link, "_blank");
                    return new NoBinanceError();
                    // throw new NoBinanceError();
                }
                try {
                    // if enable is successful but doesn't return accounts,
                    // fall back to getAccount (not happy i have to do this...)
                    // @ts-ignore
                    yield ((_a = this.provider) === null || _a === void 0 ? void 0 : _a.enable());
                }
                catch (error) {
                    if (error.code === 100001) {
                        console.error("enable error ", error);
                        // userReject: Erase the provider manually
                        this.provider = undefined;
                        this.eagerConnection = undefined;
                        return;
                    }
                }
                // Wallets may resolve eth_chainId and hang on eth_accounts pending user interaction, which may include changing
                // chains; they should be requested serially, with accounts first, so that the chainId can settle.
                const accounts = (yield this.provider.request({
                    method: "eth_requestAccounts",
                }));
                const chainId = (yield this.provider.request({
                    method: "eth_chainId",
                }));
                const receivedChainId = parseChainId(chainId);
                const desiredChainId = typeof desiredChainIdOrChainParameters === "number"
                    ? desiredChainIdOrChainParameters
                    : desiredChainIdOrChainParameters === null || desiredChainIdOrChainParameters === void 0 ? void 0 : desiredChainIdOrChainParameters.chainId;
                // if there's no desired chain, or it's equal to the received, update
                if (!desiredChainId || receivedChainId === desiredChainId) {
                    return this.actions.update({ chainId: receivedChainId, accounts });
                }
                if (!this.supportedChainIds.includes(desiredChainId)) {
                    return this.actions.update({ chainId: receivedChainId, accounts });
                }
                const desiredChainIdHex = `0x${desiredChainId.toString(16)}`;
                // if we're here, we can try to switch networks
                return this.provider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: desiredChainIdHex }],
                })
                    .catch((error) => {
                    var _a, _b;
                    console.error("provider error", error, desiredChainId);
                    // https://github.com/MetaMask/metamask-mobile/issues/3312#issuecomment-1065923294
                    const errorCode = ((_b = (_a = error.data) === null || _a === void 0 ? void 0 : _a.originalError) === null || _b === void 0 ? void 0 : _b.code) || error.code;
                    // 4902 indicates that the chain has not been added to Binance and wallet_addEthereumChain needs to be called
                    // https://docs.metamask.io/guide/rpc-api.html#wallet-switchethereumchain
                    if (errorCode === 4902 &&
                        typeof desiredChainIdOrChainParameters !== "number") {
                        if (!this.provider)
                            throw new Error("No provider");
                        // if we're here, we can try to add a new network
                        return this.provider.request({
                            method: "wallet_addEthereumChain",
                            params: [
                                Object.assign(Object.assign({}, desiredChainIdOrChainParameters), { chainId: desiredChainIdHex }),
                            ],
                        });
                    }
                    throw error;
                })
                    .then(() => this.activate(desiredChainId));
            }))
                .catch((error) => {
                cancelActivation === null || cancelActivation === void 0 ? void 0 : cancelActivation();
                throw error;
            });
        });
    }
    deactivate() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            (_a = this.provider) === null || _a === void 0 ? void 0 : _a.removeListener("chainChanged", this.handleChainChanged);
            (_b = this.provider) === null || _b === void 0 ? void 0 : _b.removeListener("accountsChanged", this.handleAccountsChanged);
            (_c = this.provider) === null || _c === void 0 ? void 0 : _c.removeListener("close", this.handleDisconnect);
            if (this.isBinanceConnector) {
                (_d = this.provider) === null || _d === void 0 ? void 0 : _d.removeListener("connect", this.handleConnect);
                (_e = this.provider) === null || _e === void 0 ? void 0 : _e.removeListener("disconnect", this.handleDisconnect);
                (_g = (_f = this.provider) === null || _f === void 0 ? void 0 : _f.disconnect) === null || _g === void 0 ? void 0 : _g.call(_f);
                // activate is triggered automatically
                this.provider = undefined;
                this.eagerConnection = undefined;
            }
            // if (super.deactivate != null) {
            //   void super.deactivate();
            // } else {
            //   void super.resetState();
            // }
        });
    }
    watchAsset(_a) {
        return __awaiter(this, arguments, void 0, function* ({ address, symbol, decimals, image, }) {
            if (!this.provider)
                throw new Error("No provider");
            return this.provider
                .request({
                method: "wallet_watchAsset",
                params: {
                    type: "ERC20", // Initially only supports ERC20, but eventually more!
                    options: {
                        address, // The address that the token is at.
                        symbol, // A ticker symbol or shorthand, up to 5 chars.
                        decimals, // The number of decimals in the token
                        image, // A string url of the token logo
                    },
                },
            })
                .then((success) => {
                if (!success)
                    throw new Error("Rejected");
                return true;
            });
        });
    }
}
exports.BinanceWallet = BinanceWallet;
exports.default = BinanceWallet;
