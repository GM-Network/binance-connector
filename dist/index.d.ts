import { Actions, AddEthereumChainParameter, RequestArguments, WatchAssetParameters } from "@web3-react/types";
import { Connector } from "@web3-react/types";
import detectEthereumProvider from "./detect-provider";
export interface BinanceWalletProvider {
    isBinance?: boolean;
    request(args: RequestArguments): Promise<any>;
    on: (event: string, args: any) => any;
    removeListener: (event: string, args: any) => any;
    disconnect?(): void;
    enable?: () => Promise<string[]>;
    providers?: Omit<BinanceWalletProvider, "providers">[];
    isConnected?: () => boolean;
    chainId: string;
    connected?: boolean;
    accounts?: string[];
    connector?: any;
}
/**
 * @param options - Options to pass to `binance/detect-provider`
 * @param onError - Handler to report errors thrown from eventListeners.
 */
interface BinanceWalletConstructorArgs {
    actions: Actions;
    supportedChainIds: number[];
    options?: Parameters<typeof detectEthereumProvider>[0];
    onError?: () => void;
}
export declare class BinanceWallet extends Connector {
    /** {@inheritdoc Connector.provider} */
    provider?: BinanceWalletProvider;
    private readonly options?;
    private readonly supportedChainIds;
    private isBinanceConnector;
    private eagerConnection?;
    private get connected();
    constructor({ actions, options, onError, supportedChainIds, }: BinanceWalletConstructorArgs);
    private handleConnect;
    private handleChainChanged;
    private handleAccountsChanged;
    private handleDisconnect;
    private isomorphicInitialize;
    /** {@inheritdoc Connector.connectEagerly} */
    connectEagerly(): Promise<void>;
    /**
     * Initiates a connection.
     *
     * @param desiredChainIdOrChainParameters - If defined, indicates the desired chain to connect to. If the user is
     * already connected to this chain, no additional steps will be taken. Otherwise, the user will be prompted to switch
     * to the chain, if one of two conditions is met: either they already have it added in their extension, or the
     * argument is of type AddEthereumChainParameter, in which case the user will be prompted to add the chain with the
     * specified parameters first, before being prompted to switch.
     */
    activate(desiredChainIdOrChainParameters?: number | AddEthereumChainParameter): Promise<void>;
    deactivate(): Promise<void>;
    watchAsset({ address, symbol, decimals, image, }: WatchAssetParameters): Promise<true>;
}
export default BinanceWallet;
